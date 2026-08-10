import {
  createHmac,
  createPrivateKey,
  sign,
  timingSafeEqual,
} from "node:crypto";

import { localeSchema, postIdSchema } from "@portfolio/contracts";
import { parseArticle, renderArticle } from "@portfolio/markdown";

const CONTENT_PREFIX = "content/";
const GITHUB_API = "https://api.github.com";

export class ContentStoreValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentStoreValidationError";
  }
}

/** Constructs the only writable article path shape on the content branch. */
export function translationContentPath(postId: string, locale: string): string {
  const parsedPostId = postIdSchema.safeParse(postId);
  const parsedLocale = localeSchema.safeParse(locale);
  if (!parsedPostId.success || !parsedLocale.success) {
    throw new ContentStoreValidationError("Invalid post ID or locale.");
  }
  return "content/blog/" + parsedPostId.data + "/" + parsedLocale.data + ".md";
}

/** Rejects path escaping and paths outside the dedicated content prefix. */
export function assertContentPath(path: string): void {
  if (
    !path.startsWith(CONTENT_PREFIX) ||
    path.includes("\\") ||
    path.includes("//") ||
    path.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    throw new ContentStoreValidationError("Path must stay under content/.");
  }
}

/**
 * Validates GitHub's raw-body SHA-256 signature. Parsing must happen only
 * after this check, so webhook payload data never crosses the trust boundary.
 */
export function verifyGitHubWebhookSignature(
  secret: string,
  rawBody: Uint8Array,
  signature: string | undefined
): boolean {
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = signature.slice("sha256=".length);
  if (!/^[a-f0-9]{64}$/i.test(received)) return false;
  return timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(received, "hex")
  );
}

/** Durable implementations use a database unique key; this port makes replay policy explicit. */
export interface WebhookDeliveryStore {
  claim(deliveryId: string, expiresAt: Date): Promise<boolean>;
}

/** In-memory implementation for unit tests and single-process development only. */
export class InMemoryWebhookDeliveryStore implements WebhookDeliveryStore {
  readonly #deliveries = new Map<string, number>();

  async claim(deliveryId: string, expiresAt: Date): Promise<boolean> {
    if (!/^[A-Za-z0-9-]{8,200}$/.test(deliveryId)) {
      throw new ContentStoreValidationError("Webhook delivery ID is invalid.");
    }
    const now = Date.now();
    for (const [id, expiry] of this.#deliveries) {
      if (expiry <= now) this.#deliveries.delete(id);
    }
    if (this.#deliveries.has(deliveryId)) return false;
    this.#deliveries.set(deliveryId, expiresAt.getTime());
    return true;
  }
}

/** Authenticate raw bytes first, then atomically reserve the delivery ID. */
export async function authenticateGitHubWebhook(input: {
  readonly secret: string;
  readonly rawBody: Uint8Array;
  readonly signature: string | undefined;
  readonly deliveryId: string | undefined;
  readonly deliveryStore: WebhookDeliveryStore;
  readonly now?: Date;
}): Promise<boolean> {
  if (
    !verifyGitHubWebhookSignature(input.secret, input.rawBody, input.signature)
  ) {
    return false;
  }
  if (!input.deliveryId) return false;
  const now = input.now ?? new Date();
  return input.deliveryStore.claim(
    input.deliveryId,
    new Date(now.getTime() + 10 * 60 * 1000)
  );
}

export interface GitContentResponse {
  readonly status: number;
  readonly body: unknown;
}

/** Narrow transport to keep host I/O mockable and credentials out of callers. */
export interface GitContentTransport {
  request(input: {
    readonly method: "GET" | "POST" | "PUT";
    readonly url: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly body?: unknown;
  }): Promise<GitContentResponse>;
}

export interface GitHubContentStoreConfig {
  readonly repository: string;
  readonly branch: string;
  readonly token: string;
}

export interface GitHubAppConfig {
  readonly appId: string;
  readonly installationId: string;
  /** PEM loaded from a server-only secret file, never a browser variable. */
  readonly privateKeyPem: string;
}

export interface GitHubInstallationToken {
  readonly token: string;
  readonly expiresAt: Date;
}

/** Creates a short-lived, installation-scoped token; no personal token path exists. */
export async function createGitHubInstallationToken(
  config: GitHubAppConfig,
  transport: GitContentTransport,
  now = new Date()
): Promise<GitHubInstallationToken> {
  if (!/^\d+$/.test(config.appId) || !/^\d+$/.test(config.installationId)) {
    throw new ContentStoreValidationError("GitHub App IDs must be numeric.");
  }
  const issuedAt = Math.floor(now.getTime() / 1000) - 60;
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({ iat: issuedAt, exp: issuedAt + 9 * 60, iss: config.appId })
  );
  let signature: string;
  try {
    signature = sign(
      "RSA-SHA256",
      Buffer.from(header + "." + payload),
      createPrivateKey(config.privateKeyPem)
    ).toString("base64url");
  } catch {
    throw new ContentStoreValidationError("GitHub App private key is invalid.");
  }
  const response = await transport.request({
    method: "POST",
    url:
      GITHUB_API +
      "/app/installations/" +
      config.installationId +
      "/access_tokens",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + header + "." + payload + "." + signature,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  const body = response.body as { token?: unknown; expires_at?: unknown };
  if (
    response.status !== 201 ||
    typeof body.token !== "string" ||
    typeof body.expires_at !== "string"
  ) {
    throw new Error("GitHub App installation token request failed.");
  }
  const expiresAt = new Date(body.expires_at);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt <= now) {
    throw new Error("GitHub returned an invalid installation-token expiry.");
  }
  return { token: body.token, expiresAt };
}

export interface GitFile {
  readonly path: string;
  readonly sha: string;
  readonly bytes: Uint8Array;
}

export interface ContentIndexStore {
  /** Atomic database implementation owns the per-commit/path idempotency key. */
  apply(input: {
    readonly commitSha: string;
    readonly path: string;
    readonly blobSha: string;
    readonly postId: string;
    readonly locale: "en" | "fa";
    readonly title: string;
    readonly slug: string;
    readonly status: "draft" | "scheduled" | "published" | "archived";
    readonly renderedHtml: string;
    readonly rendererVersion: string;
    readonly readingMinutes: number;
    readonly headings: readonly unknown[];
  }): Promise<"applied" | "already-applied">;
  recordFailure(input: {
    readonly commitSha: string;
    readonly path: string;
    readonly reason: string;
  }): Promise<void>;
}

/**
 * Re-reads a blob identified by the trusted worker, validates and renders it,
 * then hands it to a transactional, idempotent database port. Webhook JSON is
 * intentionally not accepted here as article data.
 */
export async function synchronizeGitFile(input: {
  readonly store: GitHubContentStore;
  readonly index: ContentIndexStore;
  readonly commitSha: string;
  readonly path: string;
}): Promise<"applied" | "already-applied" | "missing" | "invalid"> {
  assertContentPath(input.path);
  const file = await input.store.read(input.path);
  if (file === null) return "missing";
  try {
    const source = new TextDecoder("utf-8", { fatal: true }).decode(file.bytes);
    const parsed = parseArticle(source, input.path);
    const rendered = await renderArticle(source, input.path);
    return input.index.apply({
      commitSha: input.commitSha,
      path: input.path,
      blobSha: file.sha,
      postId: parsed.frontmatter.postId,
      locale: parsed.frontmatter.locale,
      title: parsed.frontmatter.title,
      slug: parsed.frontmatter.slug,
      status: parsed.frontmatter.status,
      renderedHtml: rendered.html,
      rendererVersion: rendered.rendererVersion,
      readingMinutes: rendered.readingTimeMinutes,
      headings: rendered.headings,
    });
  } catch (error) {
    await input.index.recordFailure({
      commitSha: input.commitSha,
      path: input.path,
      reason: error instanceof Error ? error.message.slice(0, 1000) : "unknown",
    });
    return "invalid";
  }
}

export class ContentConflictError extends Error {
  constructor() {
    super("The content file changed since its expected blob SHA.");
    this.name = "ContentConflictError";
  }
}

/** GitHub REST adapter restricted to the dedicated content branch and prefix. */
export class GitHubContentStore {
  readonly #baseUrl: string;

  constructor(
    private readonly config: GitHubContentStoreConfig,
    private readonly transport: GitContentTransport
  ) {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(config.repository)) {
      throw new ContentStoreValidationError("Repository must be owner/name.");
    }
    if (config.branch !== "content" || !config.token.trim()) {
      throw new ContentStoreValidationError(
        "The content branch and a GitHub App token are required."
      );
    }
    this.#baseUrl = GITHUB_API + "/repos/" + config.repository + "/contents/";
  }

  async read(path: string): Promise<GitFile | null> {
    assertContentPath(path);
    const response = await this.transport.request({
      method: "GET",
      url: this.url(path),
      headers: this.headers(),
    });
    if (response.status === 404) return null;
    if (response.status !== 200) throw new Error("Git content read failed.");
    const body = response.body as { content?: unknown; sha?: unknown };
    if (typeof body.content !== "string" || typeof body.sha !== "string") {
      throw new Error("Git returned an invalid content response.");
    }
    return { path, sha: body.sha, bytes: Buffer.from(body.content, "base64") };
  }

  async write(input: {
    readonly path: string;
    readonly bytes: Uint8Array;
    readonly expectedSha: string | null;
  }): Promise<string> {
    assertContentPath(input.path);
    const response = await this.transport.request({
      method: "PUT",
      url: this.url(input.path, false),
      headers: this.headers(),
      body: {
        branch: this.config.branch,
        content: Buffer.from(input.bytes).toString("base64"),
        message: "chore(content): update indexed article",
        ...(input.expectedSha === null ? {} : { sha: input.expectedSha }),
      },
    });
    if (response.status === 409 || response.status === 422) {
      throw new ContentConflictError();
    }
    if (response.status !== 200 && response.status !== 201) {
      throw new Error("Git content write failed.");
    }
    const body = response.body as { content?: { sha?: unknown } };
    if (typeof body.content?.sha !== "string") {
      throw new Error("Git returned no blob SHA for the content write.");
    }
    return body.content.sha;
  }

  private url(path: string, includeRef = true): string {
    const target =
      this.#baseUrl + path.split("/").map(encodeURIComponent).join("/");
    return includeRef
      ? target + "?ref=" + encodeURIComponent(this.config.branch)
      : target;
  }

  private headers(): Readonly<Record<string, string>> {
    return {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + this.config.token,
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }
}

function base64Url(value: string): string {
  return Buffer.from(value).toString("base64url");
}
