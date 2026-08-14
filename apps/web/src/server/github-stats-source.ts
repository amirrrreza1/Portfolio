import type { PublicSiteSettings } from "@portfolio/contracts/portfolio";
import { z } from "zod";

const GITHUB_API_ORIGIN = "https://api.github.com";
const DEFAULT_TIMEOUT_MS = 3_000;
const DEFAULT_MAX_STALE_MS = 24 * 60 * 60 * 1_000;
const MAX_NEGATIVE_CACHE_MS = 5 * 60 * 1_000;
const MAX_RESPONSE_BYTES = 64 * 1_024;

const githubStatsSchema = z
  .object({
    stars: z.int().nonnegative(),
    commits: z.int().nonnegative(),
  })
  .strict();

const repositoryResponseSchema = z
  .object({ stargazers_count: z.int().nonnegative() })
  .passthrough();
const commitResponseSchema = z.array(z.unknown()).max(1);
const cacheEntrySchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("success"),
      stats: githubStatsSchema,
      validatedAt: z.number().finite().nonnegative(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("unavailable"),
      validatedAt: z.number().finite().nonnegative(),
    })
    .strict(),
]);

export type GitHubRepositoryStats = z.infer<typeof githubStatsSchema>;
export type GitHubStatsByRepository = Readonly<
  Record<string, GitHubRepositoryStats | null>
>;

export interface GitHubStatsCache {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
}

interface GitHubStatsReaderOptions {
  readonly fetch?: typeof fetch;
  readonly cache?: GitHubStatsCache;
  readonly now?: () => number;
  readonly timeoutMs?: number;
  readonly maxStaleMs?: number;
  readonly token?: string;
  readonly onStale?: (event: {
    readonly repository: string;
    readonly ageMs: number;
  }) => void;
  readonly onUnavailable?: (event: { readonly repository: string }) => void;
}

type GitHubSettings = Pick<
  PublicSiteSettings,
  "githubUsername" | "githubRepoAllowlist" | "githubCacheTtlSeconds"
>;

class MemoryGitHubStatsCache implements GitHubStatsCache {
  readonly #entries = new Map<string, unknown>();

  get(key: string): unknown {
    return this.#entries.get(key);
  }

  set(key: string, value: unknown): void {
    this.#entries.set(key, value);
  }
}

const processCache = new MemoryGitHubStatsCache();

/**
 * Creates the server-side GitHub adapter. Only repositories present in the
 * owner-controlled SiteSettings allowlist can produce an outbound request.
 */
export function createGitHubStatsReader(
  options: GitHubStatsReaderOptions = {}
) {
  const request = options.fetch ?? fetch;
  const cache = options.cache ?? processCache;
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxStaleMs = options.maxStaleMs ?? DEFAULT_MAX_STALE_MS;
  const token = normalizeToken(options.token);
  const inFlight = new Map<string, Promise<GitHubRepositoryStats | null>>();

  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("GitHub statistics timeout must be a positive integer.");
  }
  if (!Number.isSafeInteger(maxStaleMs) || maxStaleMs < 0) {
    throw new Error(
      "GitHub statistics maximum stale age must be non-negative."
    );
  }

  return async (
    settings: GitHubSettings,
    repositoryUrls: readonly (string | null)[]
  ): Promise<GitHubStatsByRepository> => {
    const username = settings.githubUsername?.toLowerCase() ?? null;
    const allowlist = new Set(
      settings.githubRepoAllowlist.map((repository) => repository.toLowerCase())
    );
    const results = await Promise.all(
      repositoryUrls.map(async (repositoryUrl) => {
        if (repositoryUrl === null) return ["", null] as const;
        const repository = parseGitHubRepositoryUrl(repositoryUrl);
        if (
          repository === null ||
          username === null ||
          repository.owner.toLowerCase() !== username ||
          !allowlist.has(repository.name.toLowerCase())
        ) {
          return [repositoryUrl, null] as const;
        }

        const key = `${repository.owner.toLowerCase()}/${repository.name.toLowerCase()}`;
        let pending = inFlight.get(key);
        if (pending === undefined) {
          pending = readRepositoryStats({
            repository,
            request,
            cache,
            now,
            timeoutMs,
            maxStaleMs,
            ttlMs: settings.githubCacheTtlSeconds * 1_000,
            token,
            onStale: options.onStale,
            onUnavailable: options.onUnavailable,
          }).finally(() => inFlight.delete(key));
          inFlight.set(key, pending);
        }
        return [repositoryUrl, await pending] as const;
      })
    );

    return Object.fromEntries(results.filter(([key]) => key.length > 0));
  };
}

export function parseGitHubRepositoryUrl(
  input: string
): { readonly owner: string; readonly name: string } | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== "github.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    return null;
  }
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 2) return null;
  const [owner, name] = segments;
  if (
    owner === undefined ||
    name === undefined ||
    !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(owner) ||
    !/^(?=.*[a-z\d])[a-z\d._-]{1,100}$/i.test(name)
  ) {
    return null;
  }
  return { owner, name };
}

interface RepositoryReadOptions {
  readonly repository: { readonly owner: string; readonly name: string };
  readonly request: typeof fetch;
  readonly cache: GitHubStatsCache;
  readonly now: () => number;
  readonly timeoutMs: number;
  readonly maxStaleMs: number;
  readonly ttlMs: number;
  readonly token: string | undefined;
  readonly onStale: GitHubStatsReaderOptions["onStale"];
  readonly onUnavailable: GitHubStatsReaderOptions["onUnavailable"];
}

async function readRepositoryStats(
  options: RepositoryReadOptions
): Promise<GitHubRepositoryStats | null> {
  const repository = `${options.repository.owner.toLowerCase()}/${options.repository.name.toLowerCase()}`;
  const key = `github:${repository}`;
  const cached = cacheEntrySchema.safeParse(options.cache.get(key));
  const entry = cached.success ? cached.data : undefined;
  const currentTime = options.now();
  const ageMs =
    entry === undefined
      ? Number.POSITIVE_INFINITY
      : currentTime - entry.validatedAt;
  if (
    entry?.kind === "unavailable" &&
    ageMs >= 0 &&
    ageMs <= Math.min(options.ttlMs, MAX_NEGATIVE_CACHE_MS)
  ) {
    return null;
  }
  if (entry?.kind === "success" && ageMs >= 0 && ageMs <= options.ttlMs) {
    return entry.stats;
  }

  try {
    const stats = await fetchRepositoryStats(options);
    options.cache.set(key, {
      kind: "success",
      stats,
      validatedAt: currentTime,
    });
    return stats;
  } catch {
    if (
      entry?.kind === "success" &&
      ageMs >= 0 &&
      ageMs <= options.maxStaleMs
    ) {
      options.onStale?.({ repository, ageMs });
      return entry.stats;
    }
    options.cache.set(key, { kind: "unavailable", validatedAt: currentTime });
    options.onUnavailable?.({ repository });
    return null;
  }
}

async function fetchRepositoryStats(
  options: RepositoryReadOptions
): Promise<GitHubRepositoryStats> {
  const encodedOwner = encodeURIComponent(options.repository.owner);
  const encodedName = encodeURIComponent(options.repository.name);
  const baseUrl = `${GITHUB_API_ORIGIN}/repos/${encodedOwner}/${encodedName}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  const headers = {
    accept: "application/vnd.github+json",
    "user-agent": "portfolio-server-github-stats",
    "x-github-api-version": "2022-11-28",
    ...(options.token === undefined
      ? {}
      : { authorization: `Bearer ${options.token}` }),
  };

  try {
    const [repositoryResponse, commitsResponse] = await Promise.all([
      options.request(baseUrl, {
        headers,
        redirect: "error",
        signal: controller.signal,
      }),
      options.request(`${baseUrl}/commits?per_page=1`, {
        headers,
        redirect: "error",
        signal: controller.signal,
      }),
    ]);
    if (!repositoryResponse.ok) {
      throw new Error("GitHub rejected the repository statistics request.");
    }
    const repository = repositoryResponseSchema.parse(
      await readBoundedJson(repositoryResponse)
    );
    const commits =
      commitsResponse.status === 409
        ? 0
        : await readCommitCount(commitsResponse, baseUrl);
    return githubStatsSchema.parse({
      stars: repository.stargazers_count,
      commits,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function readCommitCount(
  response: Response,
  repositoryApiUrl: string
): Promise<number> {
  if (!response.ok) {
    throw new Error("GitHub rejected the commit statistics request.");
  }
  const commits = commitResponseSchema.parse(await readBoundedJson(response));
  const link = response.headers.get("link");
  if (link === null) return commits.length;
  if (link.length > 8_192) throw new Error("GitHub Link header is too large.");
  for (const part of link.split(",")) {
    const match = /<([^>]+)>;\s*rel="last"/i.exec(part.trim());
    if (match?.[1] === undefined) continue;
    const last = new URL(match[1]);
    const namedPath = new URL(repositoryApiUrl).pathname + "/commits";
    const canonicalPath = /^\/repositories\/[1-9]\d*\/commits$/u.test(
      last.pathname
    );
    if (
      last.origin !== GITHUB_API_ORIGIN ||
      (last.pathname !== namedPath && !canonicalPath)
    ) {
      throw new Error("GitHub returned an invalid pagination link.");
    }
    const page = Number(last.searchParams.get("page"));
    if (!Number.isSafeInteger(page) || page < 1) {
      throw new Error("GitHub returned an invalid commit count.");
    }
    return page;
  }
  return commits.length;
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type")?.toLowerCase();
  if (contentType !== undefined && !contentType.includes("application/json")) {
    throw new Error("GitHub returned a non-JSON response.");
  }
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new Error("GitHub response is too large.");
  }
  if (response.body === null) return null;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    byteLength += chunk.value.byteLength;
    if (byteLength > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("GitHub response is too large.");
    }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

function normalizeToken(input: string | undefined): string | undefined {
  const token = input?.trim();
  if (!token) return undefined;
  if (token.length > 500 || /[\r\n]/u.test(token)) {
    throw new Error("GITHUB_STATS_TOKEN is invalid.");
  }
  return token;
}
