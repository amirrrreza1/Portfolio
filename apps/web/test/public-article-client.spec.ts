import {
  publicArticleDetailEnvelopeSchema,
  publicArticleListEnvelopeSchema,
} from "@portfolio/contracts/blog";
import { describe, expect, it, vi } from "vitest";

import {
  createPublicArticleDetailClient,
  createPublicArticleListClient,
  PublicApiResponseError,
  PublicArticleTranslationNotFoundError,
  PublicDataUnavailableError,
  type PublicReadCache,
} from "../src/server/public-api-client";

const postId = "p12345678901234567890123";

class TestCache implements PublicReadCache {
  readonly entries = new Map<string, unknown>();
  get(key: string): unknown {
    return this.entries.get(key);
  }
  set(key: string, value: unknown): void {
    this.entries.set(key, value);
  }
}

function summary(slug = "typed-public-reads") {
  return {
    id: postId,
    slug,
    title: "Typed public reads",
    excerpt: "A strict public summary.",
    publishedAt: "2026-08-14T12:00:00.000Z",
    updatedAt: "2026-08-14T13:00:00.000Z",
    readingMinutes: 4,
    authorName: "Example Author",
    categoryKey: "engineering",
    tagKeys: ["typescript"],
    featured: true,
  };
}

function listEnvelope() {
  return publicArticleListEnvelopeSchema.parse({
    data: { locale: "en", posts: [summary()] },
    meta: { requestId: "list-request", nextCursor: null },
  });
}

function detailEnvelope() {
  return publicArticleDetailEnvelopeSchema.parse({
    data: {
      locale: "fa",
      post: {
        ...summary("خواندن-عمومی-نوعدار"),
        title: "خواندن عمومی نوعدار",
        excerpt: "خلاصه عمومی منتشرشده.",
        seoTitle: null,
        seoDescription: null,
        canonicalUrl: null,
        socialImage: null,
        renderedHtml: "<p>متن امن.</p>",
        headings: [],
        alternates: [{ locale: "en", slug: "typed-public-reads" }],
      },
    },
    meta: { requestId: "detail-request" },
  });
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: status === 200 ? { etag: '"article-etag"' } : {},
  });
}

describe("public article API clients", () => {
  it("uses isolated cursor-list paths and the 15-minute stale ceiling", async () => {
    let currentTime = 1_000;
    let online = true;
    const cache = new TestCache();
    const request = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(
      async () => {
        if (!online) throw new Error("offline");
        return jsonResponse(listEnvelope());
      }
    );
    const read = createPublicArticleListClient({
      apiOrigin: "http://127.0.0.1:4000",
      fetch: request as unknown as typeof fetch,
      cache,
      now: () => currentTime,
      onStale: vi.fn(),
    });

    await expect(read("en", { limit: 10 })).resolves.toMatchObject({
      stale: false,
    });
    expect(request.mock.calls[0]?.[0]).toEqual(
      new URL("http://127.0.0.1:4000/api/v1/public/en/blog/posts?limit=10")
    );
    expect(cache.entries.has("public:articles:list:10:first:en")).toBe(true);

    online = false;
    currentTime = 901_000;
    await expect(read("en", { limit: 10 })).resolves.toMatchObject({
      stale: true,
    });
    currentTime = 901_001;
    await expect(read("en", { limit: 10 })).rejects.toBeInstanceOf(
      PublicDataUnavailableError
    );
  });

  it("validates locale-specific detail paths and parses bounded 404 alternates", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(detailEnvelope()))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              code: "TRANSLATION_NOT_FOUND",
              message: "That translation is not available.",
              requestId: "missing-request",
            },
            meta: {
              requestId: "missing-request",
              availableTranslations: [
                { locale: "en", slug: "typed-public-reads" },
              ],
            },
          },
          404
        )
      );
    const read = createPublicArticleDetailClient({
      apiOrigin: "http://127.0.0.1:4000",
      fetch: request as unknown as typeof fetch,
      cache: new TestCache(),
    });

    await expect(read("fa", "خواندن-عمومی-نوعدار")).resolves.toMatchObject({
      envelope: detailEnvelope(),
      stale: false,
    });
    expect(request.mock.calls[0]?.[0]).toEqual(
      new URL(
        "http://127.0.0.1:4000/api/v1/public/fa/blog/posts/%D8%AE%D9%88%D8%A7%D9%86%D8%AF%D9%86-%D8%B9%D9%85%D9%88%D9%85%DB%8C-%D9%86%D9%88%D8%B9%D8%AF%D8%A7%D8%B1"
      )
    );

    await expect(read("fa", "مقاله-ناقص")).rejects.toMatchObject({
      name: "PublicArticleTranslationNotFoundError",
      status: 404,
      availableTranslations: [{ locale: "en", slug: "typed-public-reads" }],
    });
  });

  it("does not serve stale data for malformed or non-article 404 responses", async () => {
    const read = createPublicArticleDetailClient({
      apiOrigin: "http://127.0.0.1:4000",
      fetch: vi
        .fn()
        .mockResolvedValue(jsonResponse({ error: "unexpected" }, 404)),
      cache: new TestCache(),
    });
    const error = await read("en", "missing").catch(
      (caught: unknown) => caught
    );
    expect(error).toBeInstanceOf(PublicApiResponseError);
    expect(error).not.toBeInstanceOf(PublicArticleTranslationNotFoundError);
    expect(error).not.toBeInstanceOf(PublicDataUnavailableError);
  });
});
