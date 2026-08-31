import { describe, expect, it } from "vitest";

import {
  publicArticleDetailEnvelopeSchema,
  publicArticleListEnvelopeSchema,
  publicArticleTranslationNotFoundSchema,
} from "../src/blog/public.js";

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

describe("public article contracts", () => {
  it("accepts strict published listing and detail envelopes", () => {
    expect(
      publicArticleListEnvelopeSchema.safeParse({
        data: { locale: "en", posts: [summary()] },
        meta: { requestId: "list-request", nextCursor: null },
      }).success
    ).toBe(true);

    expect(
      publicArticleDetailEnvelopeSchema.safeParse({
        data: {
          locale: "fa",
          post: {
            ...summary("خواندن-عمومی-نوعدار"),
            title: "خواندن عمومی نوع‌دار",
            excerpt: "خلاصه عمومی و منتشرشده.",
            seoTitle: null,
            seoDescription: null,
            canonicalUrl: null,
            socialImage: null,
            renderedHtml: '<h2 id="intro">مقدمه</h2><p>متن امن.</p>',
            headings: [{ depth: 2, id: "intro", text: "مقدمه" }],
            alternates: [{ locale: "en", slug: "typed-public-reads" }],
          },
        },
        meta: { requestId: "detail-request" },
      }).success
    ).toBe(true);
  });

  it("rejects cross-locale slugs, unsafe headings, and internal fields", () => {
    const base = {
      data: {
        locale: "en",
        post: {
          ...summary("عنوان-فارسی"),
          seoTitle: null,
          seoDescription: null,
          canonicalUrl: null,
          socialImage: null,
          renderedHtml: "<p>Body</p>",
          headings: [{ depth: 2, id: "bad fragment", text: "Bad" }],
          alternates: [],
          bodyMarkdown: "private source",
        },
      },
      meta: { requestId: "detail-request" },
    };
    expect(publicArticleDetailEnvelopeSchema.safeParse(base).success).toBe(
      false
    );
  });

  it("accepts only the stable translation-not-found disclosure shape", () => {
    const response = {
      error: {
        code: "TRANSLATION_NOT_FOUND",
        message: "That translation is not available.",
        requestId: "missing-request",
      },
      meta: {
        requestId: "missing-request",
        availableTranslations: [{ locale: "en", slug: "typed-public-reads" }],
      },
    };
    expect(
      publicArticleTranslationNotFoundSchema.safeParse(response).success
    ).toBe(true);
    expect(
      publicArticleTranslationNotFoundSchema.safeParse({
        ...response,
        meta: { ...response.meta, draftTitle: "secret" },
      }).success
    ).toBe(false);
  });
});
