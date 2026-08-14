import { publicArticleDetailSchema } from "@portfolio/contracts/blog";
import { describe, expect, it } from "vitest";

import {
  buildPublicArticleJsonLd,
  buildPublicArticleMetadata,
} from "../src/server/public-article-seo";

const basePost = {
  id: "p12345678901234567890123",
  slug: "typed-public-reads",
  title: "Typed public reads",
  excerpt: "A strict published summary.",
  publishedAt: "2026-08-14T12:00:00.000Z",
  updatedAt: "2026-08-14T13:00:00.000Z",
  readingMinutes: 4,
  authorName: "Example Author",
  categoryKey: "engineering",
  tagKeys: ["nextjs", "typescript"],
  featured: true,
  seoTitle: "Strict article metadata",
  seoDescription: "Metadata derived from published data only.",
  canonicalUrl: null,
  renderedHtml: '<h2 id="intro">Introduction</h2><p>Safe body.</p>',
  headings: [{ depth: 2, id: "intro", text: "Introduction" }],
  alternates: [
    { locale: "en", slug: "typed-public-reads" },
    { locale: "fa", slug: "خواندن-عمومی-نوعدار" },
  ],
} as const;

describe("public article SEO", () => {
  it("emits reciprocal published alternates and English x-default", () => {
    const article = publicArticleDetailSchema.parse({
      locale: "en",
      post: basePost,
    }).post;
    const metadata = buildPublicArticleMetadata("en", article);

    expect(metadata.alternates).toEqual({
      canonical: "/en/blog/typed-public-reads",
      languages: {
        en: "/en/blog/typed-public-reads",
        fa: "/fa/blog/%D8%AE%D9%88%D8%A7%D9%86%D8%AF%D9%86-%D8%B9%D9%85%D9%88%D9%85%DB%8C-%D9%86%D9%88%D8%B9%D8%AF%D8%A7%D8%B1",
        "x-default": "/en/blog/typed-public-reads",
      },
    });
    expect(metadata.openGraph).toMatchObject({
      type: "article",
      locale: "en",
      alternateLocale: ["fa"],
      publishedTime: basePost.publishedAt,
      modifiedTime: basePost.updatedAt,
      tags: ["nextjs", "typescript"],
    });
  });

  it("never invents x-default or an unpublished locale", () => {
    const article = publicArticleDetailSchema.parse({
      locale: "fa",
      post: {
        ...basePost,
        slug: "خواندن-عمومی-نوعدار",
        alternates: [{ locale: "fa", slug: "خواندن-عمومی-نوعدار" }],
      },
    }).post;
    const metadata = buildPublicArticleMetadata("fa", article);

    expect(metadata.alternates?.languages).toEqual({
      fa: "/fa/blog/%D8%AE%D9%88%D8%A7%D9%86%D8%AF%D9%86-%D8%B9%D9%85%D9%88%D9%85%DB%8C-%D9%86%D9%88%D8%B9%D8%AF%D8%A7%D8%B1",
    });
    expect(metadata.openGraph).toMatchObject({
      locale: "fa",
      alternateLocale: [],
    });
  });

  it("uses an absolute canonical in safe BlogPosting JSON-LD", () => {
    const article = publicArticleDetailSchema.parse({
      locale: "en",
      post: { ...basePost, title: "Typed <public> reads" },
    }).post;
    const serialized = buildPublicArticleJsonLd(
      "en",
      article,
      new URL("https://portfolio.example")
    );
    const data = JSON.parse(serialized) as Record<string, unknown>;

    expect(serialized).not.toContain("<");
    expect(data).toMatchObject({
      "@type": "BlogPosting",
      mainEntityOfPage: "https://portfolio.example/en/blog/typed-public-reads",
      datePublished: basePost.publishedAt,
      dateModified: basePost.updatedAt,
      inLanguage: "en",
    });
  });
});
