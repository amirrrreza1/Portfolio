import { cacheLife, cacheTag } from "next/cache";

export interface NextCachedPublicApiResponse {
  readonly body: unknown;
  readonly etag: string | null;
  readonly status: number;
  /** Time at which this cache entry actually reached the API. */
  readonly validatedAt: number;
}

/**
 * The shared, tagged Next cache boundary for published public DTOs.
 *
 * All arguments are serializable and therefore form a stable cache key. The
 * fetch itself is deliberately uncached: this function owns the cache policy,
 * while the signed invalidation route expires entries by the attached tags.
 */
export async function readNextCachedPublicApi(
  url: string,
  tags: readonly string[],
  revalidateSeconds: number,
  timeoutMs: number
): Promise<NextCachedPublicApiResponse> {
  "use cache";

  cacheLife({
    stale: revalidateSeconds,
    revalidate: revalidateSeconds,
    // This is eviction, not the outage allowance. The caller independently
    // enforces ADR-014's maximum age using `validatedAt`.
    expire: Math.max(revalidateSeconds + 1, 24 * 60 * 60),
  });
  cacheTag(...tags);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    const body = await readJsonBody(response);

    // Retryable failures are not useful shared-cache entries. Throwing keeps
    // the last successful Next entry available for its bounded stale policy.
    if (response.status >= 500 || response.status === 429) {
      throw new NextPublicApiRetryableError(response.status);
    }

    return {
      body,
      etag: response.headers.get("etag"),
      status: response.status,
      validatedAt: Date.now(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export class NextPublicApiRetryableError extends Error {
  public constructor(readonly status: number) {
    super("The public API returned a retryable response.");
    this.name = "NextPublicApiRetryableError";
  }
}

async function readJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
