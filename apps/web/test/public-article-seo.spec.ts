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
  socialImage: null,
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
    const metadata = buildPublicArticleMetadata(
      "en",
      article,
      new URL("https://example.test")
    );

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

  it("advertises a generated share card when the author chose no image", () => {
    // SEO.md §3 asks for an Open Graph image with alt text on every indexable
    // page. An article whose author picked neither a social image nor a cover
    // is the ordinary case, so the card it points at is one this site renders
    // from the article itself — with the declared size the renderer produces.
    const article = publicArticleDetailSchema.parse({
      locale: "en",
      post: { ...basePost, socialImage: null },
    }).post;

    const metadata = buildPublicArticleMetadata(
      "en",
      article,
      new URL("https://example.test")
    );
    const images = metadata.openGraph?.images as
      | readonly {
          url: string;
          alt: string;
          type: string;
          width: number;
          height: number;
        }[]
      | undefined;

    expect(images?.[0]?.url).toBe(
      "https://example.test/en/blog/typed-public-reads/share-image"
    );
    expect(images?.[0]?.alt).toBe("Strict article metadata");
    expect(images?.[0]).toMatchObject({
      type: "image/png",
      width: 1200,
      height: 630,
    });
    // The card is the article's image everywhere it is claimed, structured
    // data included, so a consumer cannot be shown two different pictures.
    const json = JSON.parse(
      buildPublicArticleJsonLd("en", article, new URL("https://example.test"))
    ) as { image?: string };
    expect(json.image).toBe(
      "https://example.test/en/blog/typed-public-reads/share-image"
    );
  });

  it("prefers the author's own image over the generated card", () => {
    const article = publicArticleDetailSchema.parse({
      locale: "en",
      post: {
        ...basePost,
        socialImage: {
          src: "/api/v1/public/en/blog/posts/typed-public-reads/image",
          altText: "A diagram of the read path",
          mimeType: "image/png",
          width: 1600,
          height: 900,
        },
      },
    }).post;

    const images = buildPublicArticleMetadata(
      "en",
      article,
      new URL("https://example.test")
    ).openGraph?.images as readonly { url: string; alt: string }[] | undefined;
    expect(images?.[0]?.url).toBe(
      "https://example.test/api/v1/public/en/blog/posts/typed-public-reads/image"
    );
    expect(images?.[0]?.alt).toBe("A diagram of the read path");
  });

  it("declines to generate a Persian card rather than shipping a broken one", () => {
    // satori has no Arabic shaper: Persian would render as disconnected
    // letters in visual order. A Persian article therefore advertises the
    // author's image or no image at all, and the route agrees — the metadata
    // and the renderer read the same predicate.
    const article = publicArticleDetailSchema.parse({
      locale: "fa",
      post: {
        ...basePost,
        slug: "خواندن-عمومی-نوعدار",
        socialImage: null,
        alternates: [{ locale: "fa", slug: "خواندن-عمومی-نوعدار" }],
      },
    }).post;

    const metadata = buildPublicArticleMetadata(
      "fa",
      article,
      new URL("https://example.test")
    );
    expect(metadata.openGraph?.images).toBeUndefined();
    expect((metadata.twitter as { card?: string } | null)?.card).toBe(
      "summary"
    );
    const json = JSON.parse(
      buildPublicArticleJsonLd("fa", article, new URL("https://example.test"))
    ) as { image?: string };
    expect(json.image).toBeUndefined();
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
