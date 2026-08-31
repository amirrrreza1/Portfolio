import type { Locale } from "@portfolio/contracts/common";
import {
  paginationQuerySchema,
  slugSchemaFor,
  type PaginationQuery,
} from "@portfolio/contracts/common";
import {
  publicArticleDetailEnvelopeSchema,
  publicArticleListEnvelopeSchema,
  publicArticleTaxonomyEnvelopeSchema,
  publicArticleTranslationNotFoundSchema,
  publicBlogTaxonomyIndexEnvelopeSchema,
  publicFeedIndexEnvelopeSchema,
  type PublicArticleAlternate,
  type PublicArticleDetailEnvelope,
  type PublicArticleListEnvelope,
  type PublicArticleTaxonomyEnvelope,
  type PublicBlogTaxonomyIndexEnvelope,
  type PublicFeedIndexEnvelope,
  type PublicTaxonomyKind,
} from "@portfolio/contracts/blog";
import {
  publicAppearanceEnvelopeSchema,
  type PublicAppearanceEnvelope,
} from "@portfolio/contracts/appearance";
import {
  articleListCacheTag,
  publicCacheTag,
} from "@portfolio/contracts/content";
import {
  publicProjectsEnvelopeSchema,
  publicProjectDetailEnvelopeSchema,
  publicHomeEnvelopeSchema,
  publicSiteEnvelopeSchema,
  type PublicHomeEnvelope,
  type PublicProjectsEnvelope,
  type PublicProjectDetailEnvelope,
  type PublicSiteEnvelope,
} from "@portfolio/contracts/portfolio";
import { z } from "zod";

import { parseApiOrigin } from "./api-origin";

const PUBLIC_MAX_STALE_MS = 60 * 60 * 1_000;
const ARTICLE_MAX_STALE_MS = 15 * 60 * 1_000;
const DEFAULT_TIMEOUT_MS = 2_000;
const PUBLIC_REVALIDATE_SECONDS = 300;

const cacheMetadataSchema = z
  .object({
    envelope: z.unknown(),
    etag: z.string().min(1),
    validatedAt: z.number().finite().nonnegative(),
  })
  .strict();

type LocalizedEnvelope = {
  readonly data: { readonly locale: Locale };
};

type CacheEntry<TEnvelope extends LocalizedEnvelope> = {
  readonly envelope: TEnvelope;
  readonly etag: string;
  readonly validatedAt: number;
};

export interface PublicReadCache {
  get(key: string): unknown;
  set(key: string, value: unknown, tags?: readonly string[]): void;
  delete?(key: string): void;
  deleteByTag?(tag: string): void;
}

interface PublicClientOptions {
  readonly apiOrigin: string;
  readonly fetch?: typeof fetch;
  readonly cache?: PublicReadCache;
  readonly now?: () => number;
  readonly timeoutMs?: number;
  readonly maxStaleMs?: number;
  readonly onStale?: (event: {
    readonly key: string;
    readonly ageMs: number;
  }) => void;
  readonly mapResponseError?: (
    response: Response
  ) => Promise<PublicApiResponseError>;
}

export type PublicProjectsClientOptions = PublicClientOptions;
export type PublicProjectDetailClientOptions = PublicClientOptions;
export type PublicSiteClientOptions = PublicClientOptions;
export type PublicAppearanceClientOptions = PublicClientOptions;
export type PublicHomeClientOptions = PublicClientOptions;
export type PublicArticleListClientOptions = PublicClientOptions;
export type PublicArticleDetailClientOptions = PublicClientOptions;
export type PublicArticleTaxonomyClientOptions = PublicClientOptions;
export type PublicBlogTaxonomyIndexClientOptions = PublicClientOptions;
export type PublicFeedIndexClientOptions = PublicClientOptions;

export interface PublicProjectsClientResult {
  readonly envelope: PublicProjectsEnvelope;
  readonly stale: boolean;
}

export interface PublicProjectDetailClientResult {
  readonly envelope: PublicProjectDetailEnvelope;
  readonly stale: boolean;
}

export interface PublicSiteClientResult {
  readonly envelope: PublicSiteEnvelope;
  readonly stale: boolean;
}

export interface PublicAppearanceClientResult {
  readonly envelope: PublicAppearanceEnvelope;
  readonly stale: boolean;
}

export interface PublicHomeClientResult {
  readonly envelope: PublicHomeEnvelope;
  readonly stale: boolean;
}

export interface PublicArticleListClientResult {
  readonly envelope: PublicArticleListEnvelope;
  readonly stale: boolean;
}

export interface PublicArticleDetailClientResult {
  readonly envelope: PublicArticleDetailEnvelope;
  readonly stale: boolean;
}

export interface PublicArticleTaxonomyClientResult {
  readonly envelope: PublicArticleTaxonomyEnvelope;
  readonly stale: boolean;
}

export interface PublicBlogTaxonomyIndexClientResult {
  readonly envelope: PublicBlogTaxonomyIndexEnvelope;
  readonly stale: boolean;
}

export interface PublicFeedIndexClientResult {
  readonly envelope: PublicFeedIndexEnvelope;
  readonly stale: boolean;
}

export class PublicDataUnavailableError extends Error {
  public constructor() {
    super("Published portfolio data is temporarily unavailable.");
    this.name = "PublicDataUnavailableError";
  }
}

export class PublicApiResponseError extends Error {
  public constructor(readonly status: number) {
    super("The public API rejected the portfolio request.");
    this.name = "PublicApiResponseError";
  }
}

export class PublicArticleTranslationNotFoundError extends PublicApiResponseError {
  public constructor(
    readonly availableTranslations: readonly PublicArticleAlternate[]
  ) {
    super(404);
    this.name = "PublicArticleTranslationNotFoundError";
  }
}

class MemoryPublicReadCache implements PublicReadCache {
  readonly #entries = new Map<string, unknown>();
  /**
   * Collective tag to the cache keys it covers.
   *
   * Next tracks this for its own fetch cache; this map is the same idea for
   * the in-process layer, which is keyed by one string per entry and would
   * otherwise be unreachable by a tag that is not itself a key.
   */
  readonly #byTag = new Map<string, Set<string>>();

  get(key: string): unknown {
    return this.#entries.get(key);
  }

  set(key: string, value: unknown, tags: readonly string[] = []): void {
    this.#entries.set(key, value);
    for (const tag of tags) {
      if (tag === key) continue;
      const keys = this.#byTag.get(tag) ?? new Set<string>();
      keys.add(key);
      this.#byTag.set(tag, keys);
    }
  }

  delete(key: string): void {
    this.#entries.delete(key);
    for (const keys of this.#byTag.values()) keys.delete(key);
  }

  deleteByTag(tag: string): void {
    this.#entries.delete(tag);
    for (const key of this.#byTag.get(tag) ?? []) this.#entries.delete(key);
    this.#byTag.delete(tag);
  }
}

const processCache = new MemoryPublicReadCache();

/**
 * Drops a tag from the in-process last-known-good cache.
 *
 * `revalidateTag` alone is not enough. This cache is the ADR-014 bounded
 * stale-read buffer, and it sits *in front of* the fetch cache: an entry here
 * is served without asking Next for anything. Purging only the fetch tag would
 * leave a freshly unpublished article being handed out of this map for the
 * rest of its stale window, which is precisely the disclosure that unpublishing
 * exists to prevent.
 *
 * The cache key and the fetch tag are the same string by construction, so one
 * tag purges both layers.
 */
export function dropCachedPublicTag(tag: string): void {
  processCache.deleteByTag(tag);
}

export function createPublicProjectsClient(
  options: PublicProjectsClientOptions
): (locale: Locale) => Promise<PublicProjectsClientResult> {
  return createLocalizedPublicClient({
    ...options,
    cacheNamespace: "projects",
    resourcePath: "projects",
    envelopeSchema: publicProjectsEnvelopeSchema,
  });
}

export function createPublicProjectDetailClient(
  options: PublicProjectDetailClientOptions
): (locale: Locale, slug: string) => Promise<PublicProjectDetailClientResult> {
  const readers = new Map<
    string,
    (locale: Locale) => Promise<PublicProjectDetailClientResult>
  >();

  return (locale, slugInput) => {
    const slug = slugSchemaFor("en").parse(slugInput);
    let reader = readers.get(slug);
    if (reader === undefined) {
      reader = createLocalizedPublicClient({
        ...options,
        cacheNamespace: `project:${slug}`,
        resourcePath: `projects/${encodeURIComponent(slug)}`,
        envelopeSchema: publicProjectDetailEnvelopeSchema,
      });
      readers.set(slug, reader);
    }
    return reader(locale);
  };
}

export function createPublicSiteClient(
  options: PublicSiteClientOptions
): (locale: Locale) => Promise<PublicSiteClientResult> {
  return createLocalizedPublicClient({
    ...options,
    cacheNamespace: "site",
    resourcePath: "site",
    envelopeSchema: publicSiteEnvelopeSchema,
  });
}

export function createPublicAppearanceClient(
  options: PublicAppearanceClientOptions
): (locale: Locale) => Promise<PublicAppearanceClientResult> {
  return createLocalizedPublicClient({
    ...options,
    cacheNamespace: "appearance",
    resourcePath: "appearance",
    revalidateSeconds: 3_600,
    envelopeSchema: publicAppearanceEnvelopeSchema,
  });
}

export function createPublicHomeClient(
  options: PublicHomeClientOptions
): (locale: Locale) => Promise<PublicHomeClientResult> {
  return createLocalizedPublicClient({
    ...options,
    cacheNamespace: "home",
    resourcePath: "home",
    envelopeSchema: publicHomeEnvelopeSchema,
  });
}

export function createPublicArticleListClient(
  options: PublicArticleListClientOptions
): (
  locale: Locale,
  query?: Partial<PaginationQuery>
) => Promise<PublicArticleListClientResult> {
  const readers = new Map<
    string,
    (locale: Locale) => Promise<PublicArticleListClientResult>
  >();

  return (locale, queryInput = {}) => {
    const query = paginationQuerySchema.parse(queryInput);
    const key = `${query.limit}:${query.cursor ?? "first"}`;
    let reader = readers.get(key);
    if (reader === undefined) {
      const parameters = new URLSearchParams({ limit: String(query.limit) });
      if (query.cursor !== undefined) parameters.set("cursor", query.cursor);
      reader = createLocalizedPublicClient({
        ...options,
        maxStaleMs: options.maxStaleMs ?? ARTICLE_MAX_STALE_MS,
        cacheNamespace: `articles:list:${key}`,
        // Every page of every cursor also carries the collective listing tag,
        // so publishing one article reaches listings the publisher never knew
        // existed.
        collectiveTags: (readLocale) => [articleListCacheTag(readLocale)],
        resourcePath: `blog/posts?${parameters.toString()}`,
        envelopeSchema: publicArticleListEnvelopeSchema,
      });
      readers.set(key, reader);
    }
    return reader(locale);
  };
}

export function createPublicArticleDetailClient(
  options: PublicArticleDetailClientOptions
): (locale: Locale, slug: string) => Promise<PublicArticleDetailClientResult> {
  const readers = new Map<
    string,
    (locale: Locale) => Promise<PublicArticleDetailClientResult>
  >();

  return (locale, slugInput) => {
    const slug = slugSchemaFor(locale).parse(slugInput);
    const key = `${locale}:${slug}`;
    let reader = readers.get(key);
    if (reader === undefined) {
      reader = createLocalizedPublicClient({
        ...options,
        maxStaleMs: options.maxStaleMs ?? ARTICLE_MAX_STALE_MS,
        cacheNamespace: `article:${slug}`,
        resourcePath: `blog/posts/${encodeURIComponent(slug)}`,
        envelopeSchema: publicArticleDetailEnvelopeSchema,
        mapResponseError: mapArticleDetailResponseError,
      });
      readers.set(key, reader);
    }
    return reader(locale);
  };
}

/**
 * One reader per (kind, slug, page), memoized like the listing reader.
 *
 * Taxonomy pages share the collective article tag rather than owning one:
 * publishing an article changes which category and tag pages mention it, and
 * the publisher cannot know which terms a reader happens to have warmed.
 */
export function createPublicArticleTaxonomyClient(
  options: PublicArticleTaxonomyClientOptions
): (
  locale: Locale,
  kind: PublicTaxonomyKind,
  slug: string,
  query?: Partial<PaginationQuery>
) => Promise<PublicArticleTaxonomyClientResult> {
  const readers = new Map<
    string,
    (locale: Locale) => Promise<PublicArticleTaxonomyClientResult>
  >();

  return (locale, kind, slugInput, queryInput = {}) => {
    const slug = slugSchemaFor(locale).parse(slugInput);
    const query = paginationQuerySchema.parse(queryInput);
    const key = `${locale}:${kind}:${slug}:${query.limit}:${query.cursor ?? "first"}`;
    let reader = readers.get(key);
    if (reader === undefined) {
      const parameters = new URLSearchParams({ limit: String(query.limit) });
      if (query.cursor !== undefined) parameters.set("cursor", query.cursor);
      const segment = kind === "category" ? "categories" : "tags";
      reader = createLocalizedPublicClient({
        ...options,
        maxStaleMs: options.maxStaleMs ?? ARTICLE_MAX_STALE_MS,
        cacheNamespace: `articles:${segment}:${slug}:${query.limit}:${query.cursor ?? "first"}`,
        collectiveTags: (readLocale) => [articleListCacheTag(readLocale)],
        resourcePath: `blog/${segment}/${encodeURIComponent(slug)}?${parameters.toString()}`,
        envelopeSchema: publicArticleTaxonomyEnvelopeSchema,
      });
      readers.set(key, reader);
    }
    return reader(locale);
  };
}

export function createPublicBlogTaxonomyIndexClient(
  options: PublicBlogTaxonomyIndexClientOptions
): (locale: Locale) => Promise<PublicBlogTaxonomyIndexClientResult> {
  return createLocalizedPublicClient({
    ...options,
    maxStaleMs: options.maxStaleMs ?? ARTICLE_MAX_STALE_MS,
    cacheNamespace: "articles:taxonomy",
    collectiveTags: (readLocale) => [articleListCacheTag(readLocale)],
    resourcePath: "blog/taxonomy",
    envelopeSchema: publicBlogTaxonomyIndexEnvelopeSchema,
  });
}

export function createPublicFeedIndexClient(
  options: PublicFeedIndexClientOptions
): (
  locale: Locale,
  query?: Partial<PaginationQuery>
) => Promise<PublicFeedIndexClientResult> {
  const readers = new Map<
    string,
    (locale: Locale) => Promise<PublicFeedIndexClientResult>
  >();

  return (locale, queryInput = {}) => {
    const query = paginationQuerySchema.parse(queryInput);
    const key = `${query.limit}:${query.cursor ?? "first"}`;
    let reader = readers.get(key);
    if (reader === undefined) {
      const parameters = new URLSearchParams({ limit: String(query.limit) });
      if (query.cursor !== undefined) parameters.set("cursor", query.cursor);
      reader = createLocalizedPublicClient({
        ...options,
        maxStaleMs: options.maxStaleMs ?? ARTICLE_MAX_STALE_MS,
        cacheNamespace: `articles:feed-index:${key}`,
        collectiveTags: (readLocale) => [articleListCacheTag(readLocale)],
        resourcePath: `blog/feed-index?${parameters.toString()}`,
        envelopeSchema: publicFeedIndexEnvelopeSchema,
      });
      readers.set(key, reader);
    }
    return reader(locale);
  };
}

function createLocalizedPublicClient<TEnvelope extends LocalizedEnvelope>(
  options: PublicClientOptions & {
    readonly cacheNamespace: string;
    /**
     * Tags registered in addition to this reader's own cache key.
     *
     * A paginated resource has an unbounded number of cache keys and the
     * publisher cannot enumerate the ones a reader warmed, so it names a
     * collective tag instead and every page registers under it.
     */
    readonly collectiveTags?: (locale: Locale) => readonly string[];
    readonly resourcePath: string;
    readonly revalidateSeconds?: number;
    readonly envelopeSchema: z.ZodType<TEnvelope>;
  }
): (locale: Locale) => Promise<{ envelope: TEnvelope; stale: boolean }> {
  const apiOrigin = parseApiOrigin(options.apiOrigin);
  const request = options.fetch ?? fetch;
  const cache = options.cache ?? processCache;
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxStaleMs = options.maxStaleMs ?? PUBLIC_MAX_STALE_MS;
  const revalidateSeconds =
    options.revalidateSeconds ?? PUBLIC_REVALIDATE_SECONDS;

  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("Public API timeout must be a positive integer.");
  }
  if (!Number.isSafeInteger(maxStaleMs) || maxStaleMs < 0) {
    throw new Error("Public API maximum stale age must be non-negative.");
  }

  return async (locale: Locale) => {
    // Built by the shared contract, not spelled here: the API names these same
    // strings in invalidation events, and a mismatch is not a type error — it
    // is a purge that silently does nothing.
    const key = publicCacheTag(options.cacheNamespace, locale);
    // Resolved per call, not per reader. Readers are memoized by pagination
    // key and serve every locale, so a tag captured at construction would
    // attach one locale's tag to the other's cached page.
    const tags = [key, ...(options.collectiveTags?.(locale) ?? [])];
    const cached = readValidCacheEntry(
      cache,
      key,
      locale,
      options.envelopeSchema
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await request(
        new URL(`/api/v1/public/${locale}/${options.resourcePath}`, apiOrigin),
        {
          headers: {
            accept: "application/json",
            ...(cached ? { "if-none-match": cached.etag } : {}),
          },
          signal: controller.signal,
          next: {
            revalidate: revalidateSeconds,
            tags,
          },
        }
      );

      if (response.status === 304 && cached !== undefined) {
        const refreshed = { ...cached, validatedAt: now() };
        cache.set(key, refreshed, tags);
        return { envelope: refreshed.envelope, stale: false };
      }

      if (response.ok) {
        const envelope = options.envelopeSchema.parse(await response.json());
        if (envelope.data.locale !== locale) {
          throw new Error("Public API returned a cross-locale response.");
        }
        const etag = response.headers.get("etag");
        if (!etag) throw new Error("Public API response is missing its ETag.");

        cache.set(key, { envelope, etag, validatedAt: now() }, tags);
        return { envelope, stale: false };
      }

      if (response.status < 500 && response.status !== 429) {
        throw options.mapResponseError
          ? await options.mapResponseError(response)
          : new PublicApiResponseError(response.status);
      }

      return serveStaleOrThrow(cached, key, now(), maxStaleMs, options.onStale);
    } catch (error) {
      if (error instanceof PublicApiResponseError) throw error;
      return serveStaleOrThrow(cached, key, now(), maxStaleMs, options.onStale);
    } finally {
      clearTimeout(timeout);
    }
  };
}

async function mapArticleDetailResponseError(
  response: Response
): Promise<PublicApiResponseError> {
  if (response.status === 404) {
    try {
      const parsed = publicArticleTranslationNotFoundSchema.safeParse(
        await response.json()
      );
      if (parsed.success) {
        return new PublicArticleTranslationNotFoundError(
          parsed.data.meta.availableTranslations
        );
      }
    } catch {
      // Fall through to the stable status-only error.
    }
  }
  return new PublicApiResponseError(response.status);
}

function readValidCacheEntry<TEnvelope extends LocalizedEnvelope>(
  cache: PublicReadCache,
  key: string,
  locale: Locale,
  envelopeSchema: z.ZodType<TEnvelope>
): CacheEntry<TEnvelope> | undefined {
  const metadata = cacheMetadataSchema.safeParse(cache.get(key));
  if (!metadata.success) return undefined;

  const envelope = envelopeSchema.safeParse(metadata.data.envelope);
  if (!envelope.success || envelope.data.data.locale !== locale) {
    return undefined;
  }

  return {
    envelope: envelope.data,
    etag: metadata.data.etag,
    validatedAt: metadata.data.validatedAt,
  };
}

function serveStaleOrThrow<TEnvelope extends LocalizedEnvelope>(
  cached: CacheEntry<TEnvelope> | undefined,
  key: string,
  currentTime: number,
  maxStaleMs: number,
  onStale: PublicClientOptions["onStale"]
): { envelope: TEnvelope; stale: boolean } {
  if (cached !== undefined) {
    const ageMs = currentTime - cached.validatedAt;
    if (ageMs >= 0 && ageMs <= maxStaleMs) {
      onStale?.({ key, ageMs });
      return { envelope: cached.envelope, stale: true };
    }
  }

  throw new PublicDataUnavailableError();
}
