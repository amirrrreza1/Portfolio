import { describe, expect, it } from "vitest";

import {
  publicArticleTaxonomyEnvelopeSchema,
  publicFeedIndexEnvelopeSchema,
  publicTaxonomySchema,
} from "../src/blog/discovery.js";
import { publicArticleDetailItemSchema } from "../src/blog/public.js";

const postId = "p12345678901234567890123";

function summary(slug = "typed-public-reads") {
  return {
    id: postId,
    slug,
    title: "Typed public reads",
    excerpt: "A strict published article summary.",
    publishedAt: "2026-08-14T12:00:00.000Z",
    updatedAt: "2026-08-14T13:00:00.000Z",
    readingMinutes: 4,
    authorName: "Example Author",
    categoryKey: "engineering",
    tagKeys: ["typescript", "nextjs"],
    featured: true,
  };
}

function feedEntry(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    slug: "typed-public-reads",
    title: "Typed public reads",
    excerpt: "A strict published article summary.",
    publishedAt: "2026-08-14T12:00:00.000Z",
    updatedAt: "2026-08-14T13:00:00.000Z",
    authorName: "Example Author",
    categoryKey: "engineering",
    tagKeys: ["typescript"],
    alternates: [
      { locale: "en", slug: "typed-public-reads" },
      { locale: "fa", slug: "خواندن-عمومی-نوعدار" },
    ],
    ...overrides,
  };
}

describe("blog discovery contracts", () => {
  it("accepts a strict category page and its cursor envelope", () => {
    expect(
      publicArticleTaxonomyEnvelopeSchema.safeParse({
        data: {
          locale: "en",
          taxonomy: {
            kind: "category",
            key: "engineering",
            slug: "engineering",
            name: "Engineering",
            description: null,
            alternates: [{ locale: "en", slug: "engineering" }],
          },
          posts: [summary()],
        },
        meta: { requestId: "taxonomy-request", nextCursor: null },
      }).success
    ).toBe(true);
  });

  it("rejects a taxonomy slug that is not canonical for the response locale", () => {
    // The whole point of a locale-scoped slug: a Persian term reached through
    // the English path would be a URL the English page could never link to.
    expect(
      publicArticleTaxonomyEnvelopeSchema.safeParse({
        data: {
          locale: "en",
          taxonomy: {
            kind: "category",
            key: "engineering",
            slug: "مهندسی",
            name: "Engineering",
            description: null,
            alternates: [{ locale: "fa", slug: "مهندسی" }],
          },
          posts: [],
        },
        meta: { requestId: "taxonomy-request", nextCursor: null },
      }).success
    ).toBe(false);
  });

  it("refuses internal taxonomy fields on a public page", () => {
    expect(
      publicTaxonomySchema.safeParse({
        kind: "tag",
        key: "typescript",
        slug: "typescript",
        name: "TypeScript",
        description: null,
        alternates: [{ locale: "en", slug: "typescript" }],
        enabled: true,
      }).success
    ).toBe(false);
  });

  it("requires a feed entry to include itself among its alternates", () => {
    // The sitemap emits these as `xhtml:link` and the page emits them as
    // `hreflang`; a group that omits the current locale would make the two
    // disagree, which is exactly the mismatch SEO.md forbids.
    expect(
      publicFeedIndexEnvelopeSchema.safeParse({
        data: { locale: "en", entries: [feedEntry()] },
        meta: { requestId: "feed-request", nextCursor: null },
      }).success
    ).toBe(true);

    expect(
      publicFeedIndexEnvelopeSchema.safeParse({
        data: {
          locale: "en",
          entries: [
            feedEntry({
              alternates: [{ locale: "fa", slug: "خواندن-عمومی-نوعدار" }],
            }),
          ],
        },
        meta: { requestId: "feed-request", nextCursor: null },
      }).success
    ).toBe(false);
  });

  it("keeps the rendered body out of the feed index entirely", () => {
    expect(
      publicFeedIndexEnvelopeSchema.safeParse({
        data: {
          locale: "en",
          entries: [feedEntry({ renderedHtml: "<p>Body</p>" })],
        },
        meta: { requestId: "feed-request", nextCursor: null },
      }).success
    ).toBe(false);
  });

  it("accepts a resolved social image and rejects a half-known size", () => {
    const base = {
      ...summary(),
      seoTitle: null,
      seoDescription: null,
      canonicalUrl: null,
      renderedHtml: "<p>Body</p>",
      headings: [],
      alternates: [],
    };
    expect(
      publicArticleDetailItemSchema.safeParse({
        ...base,
        socialImage: {
          src: "/api/v1/public/en/blog/posts/typed-public-reads/image",
          altText: "A social card",
          mimeType: "image/png",
          width: 1200,
          height: 630,
        },
      }).success
    ).toBe(true);

    expect(
      publicArticleDetailItemSchema.safeParse({
        ...base,
        socialImage: {
          src: "/api/v1/public/en/blog/posts/typed-public-reads/image",
          altText: "A social card",
          mimeType: "image/png",
          width: 1200,
          height: null,
        },
      }).success
    ).toBe(false);

    expect(
      publicArticleDetailItemSchema.safeParse({
        ...base,
        socialImage: {
          src: "/api/v1/public/en/blog/posts/typed-public-reads/image?v=2",
          altText: "A social card",
          mimeType: "image/png",
          width: 1200,
          height: 630,
        },
      }).success
    ).toBe(false);
  });
});
