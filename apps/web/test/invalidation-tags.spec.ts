import { articleCacheTags, publicCacheTag } from "@portfolio/contracts/content";
import { publicArticleListEnvelopeSchema } from "@portfolio/contracts/blog";
import { describe, expect, it } from "vitest";

import {
  createPublicArticleDetailClient,
  createPublicArticleListClient,
  dropCachedPublicTag,
  type PublicReadCache,
} from "../src/server/public-api-client";

/**
 * The publisher's tags must match the tags the reader actually registers.
 *
 * This file exists because they did not. `articleCacheTags` named
 * `public:articles:<locale>`, and the listing client registered
 * `public:articles:list:<limit>:<cursor>:<locale>` — so publishing an article
 * purged its detail page and left every cached listing untouched until its
 * revalidate window lapsed.
 *
 * Nothing caught it. The contract tests asserted the publisher's tags against
 * a hardcoded copy of themselves, which proves the function is stable and
 * proves nothing about whether anyone listens on the other end. A tag is a
 * wire agreement between two processes; the only test worth having is one that
 * puts both ends in the same assertion.
 */

function listEnvelope(locale: "en" | "fa") {
  return publicArticleListEnvelopeSchema.parse({
    data: {
      locale,
      posts: [
        {
          id: "p12345678901234567890123",
          slug: "hello-world",
          title: "Hello world",
          excerpt: "A strict public summary.",
          publishedAt: "2026-08-14T12:00:00.000Z",
          updatedAt: "2026-08-14T13:00:00.000Z",
          readingMinutes: 4,
          authorName: "Example Author",
          categoryKey: "engineering",
          tagKeys: ["typescript"],
          featured: true,
        },
      ],
    },
    meta: { requestId: "list-request", nextCursor: null },
  });
}

/** Records the tags every fetch registers, keyed by nothing else. */
function recordingFetch(): {
  readonly fetch: typeof fetch;
  readonly tags: string[][];
} {
  const tags: string[][] = [];
  const value = (async (
    url: URL,
    init: RequestInit & { next?: { tags?: string[] } }
  ) => {
    tags.push([...(init.next?.tags ?? [])]);
    const locale = String(url).includes("/fa/") ? "fa" : "en";
    return new Response(JSON.stringify(listEnvelope(locale)), {
      status: 200,
      headers: { etag: '"v1"', "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fetch: value, tags };
}

function scratchCache(): PublicReadCache & {
  readonly entries: Map<string, unknown>;
} {
  const entries = new Map<string, unknown>();
  return {
    entries,
    get: (key) => entries.get(key),
    set: (key, value) => entries.set(key, value),
    delete: (key) => entries.delete(key),
  };
}

describe("publisher and reader agree on tags", () => {
  it("registers every tag the publisher will purge for a listing", async () => {
    const recorder = recordingFetch();
    const read = createPublicArticleListClient({
      apiOrigin: "http://api.test",
      fetch: recorder.fetch,
      cache: scratchCache(),
    });

    await read("en");

    const registered = recorder.tags[0] ?? [];
    // The tag the API names when any article changes must be one this read
    // actually carries, or the purge reaches nothing.
    expect(registered).toContain(publicCacheTag("articles", "en"));
  });

  it("registers the collective tag on every paginated page, not just the first", async () => {
    // The publisher cannot enumerate cursors, so a per-page tag alone would
    // leave every page past the first stale after a publish.
    const recorder = recordingFetch();
    const read = createPublicArticleListClient({
      apiOrigin: "http://api.test",
      fetch: recorder.fetch,
      cache: scratchCache(),
    });

    await read("en");
    await read("en", { limit: 5 });

    for (const registered of recorder.tags) {
      expect(registered).toContain(publicCacheTag("articles", "en"));
    }
  });

  it("keeps one locale's collective tag off the other locale's page", async () => {
    // Readers are memoized by pagination key and serve both locales, so a tag
    // captured when the reader was built would leak across languages and one
    // publication would purge the other's cache.
    const recorder = recordingFetch();
    const read = createPublicArticleListClient({
      apiOrigin: "http://api.test",
      fetch: recorder.fetch,
      cache: scratchCache(),
    });

    await read("en");
    await read("fa");

    expect(recorder.tags[0]).toContain(publicCacheTag("articles", "en"));
    expect(recorder.tags[1]).toContain(publicCacheTag("articles", "fa"));
    expect(recorder.tags[1]).not.toContain(publicCacheTag("articles", "en"));
  });

  it("registers the detail tag the publisher will purge", async () => {
    const recorder = recordingFetch();
    const read = createPublicArticleDetailClient({
      apiOrigin: "http://api.test",
      fetch: recorder.fetch,
      cache: scratchCache(),
    });

    await read("en", "hello-world").catch(() => undefined);

    const expected = articleCacheTags({ locale: "en", slug: "hello-world" });
    expect(recorder.tags[0]).toContain(expected[0]);
  });

  it("covers every publisher tag between the listing and the detail reads", async () => {
    // The assertion that would have caught the original bug: take the tags the
    // API emits for one publication and require that something on this side
    // registered each of them.
    const recorder = recordingFetch();
    const list = createPublicArticleListClient({
      apiOrigin: "http://api.test",
      fetch: recorder.fetch,
      cache: scratchCache(),
    });
    const detail = createPublicArticleDetailClient({
      apiOrigin: "http://api.test",
      fetch: recorder.fetch,
      cache: scratchCache(),
    });

    await list("en");
    await detail("en", "hello-world").catch(() => undefined);

    const registered = new Set(recorder.tags.flat());
    for (const tag of articleCacheTags({ locale: "en", slug: "hello-world" })) {
      expect(registered).toContain(tag);
    }
  });
});

describe("dropCachedPublicTag", () => {
  it("evicts a paginated page through its collective tag", async () => {
    // The in-process cache is keyed by one string per entry, so a collective
    // tag is not itself a key. Without a tag index this purge silently leaves
    // the entry in place.
    //
    // The observable signal is the conditional request. This client always
    // revalidates — the in-process cache is the ADR-014 last-known-good buffer,
    // not a request-avoidance cache — so a live entry means the next read sends
    // `if-none-match` and can be answered `304` with the old body. After a real
    // eviction there is no ETag to send, and a 304 is no longer possible.
    const conditional: (string | null)[] = [];
    const fetcher = (async (
      _url: URL,
      init: RequestInit & { next?: { tags?: string[] } }
    ) => {
      const headers = new Headers(init.headers);
      conditional.push(headers.get("if-none-match"));
      return new Response(JSON.stringify(listEnvelope("en")), {
        status: 200,
        headers: { etag: '"v1"', "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const read = createPublicArticleListClient({
      apiOrigin: "http://api.test",
      fetch: fetcher,
    });

    await read("en");
    expect(conditional).toEqual([null]);

    await read("en");
    expect(conditional).toEqual([null, '"v1"']);

    dropCachedPublicTag(publicCacheTag("articles", "en"));

    await read("en");
    expect(conditional).toEqual([null, '"v1"', null]);
  });
});
