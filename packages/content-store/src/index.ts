import {
  createHmac,
  createPrivateKey,
  sign,
  timingSafeEqual,
} from "node:crypto";

import {
  blobShaSchema,
  localeSchema,
  postIdSchema,
  type Frontmatter,
} from "@portfolio/contracts";
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

export class ContentWebhookHandler {
  constructor(
    private readonly secret: string,
    private readonly deliveryStore: WebhookDeliveryStore,
    private readonly enqueueReconciliation: () => Promise<void>
  ) {}

  /** Payload bytes authenticate a trigger only; they are never parsed as content. */
  async receive(input: {
    readonly rawBody: Uint8Array;
    readonly signature: string | undefined;
    readonly deliveryId: string | undefined;
  }): Promise<"accepted" | "duplicate" | "rejected"> {
    if (
      !verifyGitHubWebhookSignature(this.secret, input.rawBody, input.signature)
    ) {
      return "rejected";
    }
    if (!input.deliveryId) return "rejected";
    const claimed = await this.deliveryStore.claim(
      input.deliveryId,
      new Date(Date.now() + 10 * 60 * 1000)
    );
    if (!claimed) return "duplicate";
    await this.enqueueReconciliation();
    return "accepted";
  }
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

/** Production transport; callers may supply a test fetch without widening the port. */
export function createFetchGitContentTransport(
  fetcher: typeof fetch = fetch
): GitContentTransport {
  return {
    request: async (input) => {
      const response = await fetcher(input.url, {
        method: input.method,
        headers: input.headers,
        ...(input.body === undefined
          ? {}
          : { body: JSON.stringify(input.body) }),
      });
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        // GitHub errors may legitimately arrive without a JSON document.
      }
      return { status: response.status, body };
    },
  };
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

export interface ContentStoreRuntimeConfig extends GitHubAppConfig {
  readonly repository: string;
  readonly branch: "content";
  readonly webhookSecret: string;
}

/** Validates non-public environment values before the API begins listening. */
export async function loadContentStoreRuntimeConfig(input: {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly readPrivateKey: (path: string) => Promise<string>;
}): Promise<ContentStoreRuntimeConfig> {
  const value = (name: string): string => {
    const candidate = input.environment[name]?.trim();
    if (!candidate || candidate.startsWith("replace_")) {
      throw new ContentStoreValidationError(name + " is required.");
    }
    return candidate;
  };
  const provider = value("CONTENT_GIT_PROVIDER");
  const branch = value("CONTENT_GIT_BRANCH");
  const prefix = value("CONTENT_GIT_CONTENT_PREFIX");
  if (
    provider !== "github" ||
    branch !== "content" ||
    prefix !== CONTENT_PREFIX
  ) {
    throw new ContentStoreValidationError(
      "Content store provider, branch, or prefix is unsafe."
    );
  }
  const privateKeyPem = await input.readPrivateKey(
    value("CONTENT_GIT_PRIVATE_KEY_PATH")
  );
  if (!privateKeyPem.trim()) {
    throw new ContentStoreValidationError(
      "Content Git private key file is empty."
    );
  }
  return {
    repository: value("CONTENT_GIT_REPO"),
    branch: "content",
    appId: value("CONTENT_GIT_APP_ID"),
    installationId: value("CONTENT_GIT_INSTALLATION_ID"),
    privateKeyPem,
    webhookSecret: value("CONTENT_GIT_WEBHOOK_SECRET"),
  };
}

export interface GitHubInstallationToken {
  readonly token: string;
  readonly expiresAt: Date;
}

/** Reuses an installation token until its final minute; it never persists it. */
export class GitHubAppTokenProvider {
  #cached: GitHubInstallationToken | undefined;

  constructor(
    private readonly config: GitHubAppConfig,
    private readonly transport: GitContentTransport
  ) {}

  async token(now = new Date()): Promise<string> {
    if (
      this.#cached !== undefined &&
      this.#cached.expiresAt.getTime() - now.getTime() > 60_000
    ) {
      return this.#cached.token;
    }
    this.#cached = await createGitHubInstallationToken(
      this.config,
      this.transport,
      now
    );
    return this.#cached.token;
  }
}

/** Materializes the Git client from validated runtime configuration on demand. */
export async function createGitHubContentStoreFromRuntime(
  config: ContentStoreRuntimeConfig,
  transport: GitContentTransport,
  tokenProvider = new GitHubAppTokenProvider(config, transport)
): Promise<GitHubContentStore> {
  return new GitHubContentStore(
    {
      repository: config.repository,
      branch: config.branch,
      token: await tokenProvider.token(),
    },
    transport
  );
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
    /** The validated source of every indexed publication field. */
    readonly frontmatter: Frontmatter;
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
  /**
   * Marks known index entries whose canonical files are absent from this tree.
   * It preserves their last good render; publication removal requires an
   * explicit owner action.
   */
  markMissing?(input: {
    readonly commitSha: string;
    readonly presentPaths: readonly string[];
  }): Promise<number>;
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
      frontmatter: parsed.frontmatter,
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

export interface ContentReconciliationSummary {
  readonly applied: number;
  readonly alreadyApplied: number;
  readonly missing: number;
  readonly invalid: number;
}

/** Reconciles the complete content tree at a Git commit, not webhook data. */
export async function reconcileGitCommit(input: {
  readonly store: GitHubContentStore;
  readonly index: ContentIndexStore;
  readonly commitSha: string;
}): Promise<ContentReconciliationSummary> {
  const paths = await input.store.articlePathsAtCommit(input.commitSha);
  const summary = {
    applied: 0,
    alreadyApplied: 0,
    missing: 0,
    invalid: 0,
  };
  for (const path of paths) {
    const outcome = await synchronizeGitFile({ ...input, path });
    if (outcome === "applied") summary.applied += 1;
    else if (outcome === "already-applied") summary.alreadyApplied += 1;
    else if (outcome === "missing") summary.missing += 1;
    else summary.invalid += 1;
  }
  summary.missing +=
    (await input.index.markMissing?.({
      commitSha: input.commitSha,
      presentPaths: paths,
    })) ?? 0;
  return summary;
}

/** Reconciliation always targets the branch's fresh Git reference. */
export async function reconcileContentHead(input: {
  readonly store: GitHubContentStore;
  readonly index: ContentIndexStore;
}): Promise<ContentReconciliationSummary> {
  return reconcileGitCommit({
    ...input,
    commitSha: await input.store.headCommitSha(),
  });
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

  async articlePathsAtCommit(commitSha: string): Promise<readonly string[]> {
    if (!blobShaSchema.safeParse(commitSha).success) {
      throw new ContentStoreValidationError("Commit SHA is invalid.");
    }
    const response = await this.transport.request({
      method: "GET",
      url:
        GITHUB_API +
        "/repos/" +
        this.config.repository +
        "/git/trees/" +
        encodeURIComponent(commitSha) +
        "?recursive=1",
      headers: this.headers(),
    });
    if (response.status !== 200)
      throw new Error("Git content tree read failed.");
    const body = response.body as { tree?: unknown };
    if (!Array.isArray(body.tree)) {
      throw new Error("Git returned an invalid content tree.");
    }
    return body.tree.flatMap((entry) => {
      const candidate = entry as { path?: unknown; type?: unknown };
      if (candidate.type !== "blob" || typeof candidate.path !== "string")
        return [];
      try {
        assertContentPath(candidate.path);
        return /^content\/blog\/[a-z0-9]+\/(?:en|fa)\.md$/.test(candidate.path)
          ? [candidate.path]
          : [];
      } catch {
        return [];
      }
    });
  }

  async headCommitSha(): Promise<string> {
    const response = await this.transport.request({
      method: "GET",
      url:
        GITHUB_API +
        "/repos/" +
        this.config.repository +
        "/git/ref/heads/" +
        encodeURIComponent(this.config.branch),
      headers: this.headers(),
    });
    const body = response.body as { object?: { sha?: unknown } };
    if (response.status !== 200 || typeof body.object?.sha !== "string") {
      throw new Error("Git content branch reference read failed.");
    }
    if (!blobShaSchema.safeParse(body.object.sha).success) {
      throw new Error("Git returned an invalid content branch commit SHA.");
    }
    return body.object.sha;
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
