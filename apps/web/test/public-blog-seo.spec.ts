import { publicArticleListSchema } from "@portfolio/contracts/blog";
import { describe, expect, it } from "vitest";

import {
  buildBlogIndexJsonLd,
  buildBreadcrumbJsonLd,
  buildTaxonomyJsonLd,
  selectRelatedArticles,
} from "../src/server/public-blog-seo";

const siteUrl = new URL("https://example.test");

function summary(
  overrides: Readonly<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
    id: "p12345678901234567890123",
    slug: "typed-public-reads",
    title: "Typed public reads",
    excerpt: "A strict published summary.",
    publishedAt: "2026-08-14T12:00:00.000Z",
    updatedAt: "2026-08-14T13:00:00.000Z",
    readingMinutes: 4,
    authorName: "Example Author",
    categoryKey: "engineering",
    tagKeys: ["typescript"],
    featured: false,
    ...overrides,
  };
}

const posts = publicArticleListSchema.parse({
  locale: "en",
  posts: [
    summary(),
    summary({
      id: "p22345678901234567890123",
      slug: "same-category",
      title: "Same category",
      tagKeys: [],
      publishedAt: "2026-08-10T12:00:00.000Z",
    }),
    summary({
      id: "p32345678901234567890123",
      slug: "same-tag-only",
      title: "Same tag only",
      categoryKey: "operations",
      publishedAt: "2026-08-12T12:00:00.000Z",
    }),
    summary({
      id: "p42345678901234567890123",
      slug: "unrelated",
      title: "Unrelated",
      categoryKey: "operations",
      tagKeys: ["prisma"],
    }),
  ],
}).posts;

describe("selectRelatedArticles", () => {
  it("ranks a shared category above a shared tag and never includes the article itself", () => {
    const related = selectRelatedArticles(posts[0]!, posts);
    expect(related.map(({ slug }) => slug)).toEqual([
      "same-category",
      "same-tag-only",
    ]);
  });

  it("returns nothing rather than padding when nothing is actually related", () => {
    // An empty related list is an honest answer. Filling it with recent
    // articles would make the block a "more posts" list wearing a label that
    // claims a relationship the author never declared.
    const related = selectRelatedArticles(
      { slug: "lonely", categoryKey: null, tagKeys: [] },
      posts
    );
    expect(related).toEqual([]);
  });

  it("selects from declared taxonomy alone, with no visitor signal", () => {
    const first = selectRelatedArticles(posts[0]!, posts);
    const second = selectRelatedArticles(posts[0]!, posts);
    expect(second).toEqual(first);
  });
});

describe("structured data", () => {
  it("describes the blog index from the same entries the feed carries", () => {
    const json = JSON.parse(
      buildBlogIndexJsonLd(
        "en",
        {
          title: "Blog",
          description: "Articles",
          entries: [
            {
              slug: "typed-public-reads",
              title: "Typed public reads",
              excerpt: "A strict published summary.",
              publishedAt: "2026-08-14T12:00:00.000Z",
              updatedAt: "2026-08-14T13:00:00.000Z",
              authorName: "Example Author",
              categoryKey: "engineering",
              tagKeys: ["typescript"],
              alternates: [{ locale: "en", slug: "typed-public-reads" }],
            },
          ],
        },
        siteUrl
      )
    ) as Record<string, unknown>;

    expect(json["@type"]).toBe("Blog");
    expect(json.inLanguage).toBe("en");
    expect(json.url).toBe("https://example.test/en/blog");
    expect((json.blogPost as { url: string }[])[0]?.url).toBe(
      "https://example.test/en/blog/typed-public-reads"
    );
  });

  it("describes a taxonomy page as a collection over absolute article URLs", () => {
    const json = JSON.parse(
      buildTaxonomyJsonLd(
        "en",
        {
          kind: "tag",
          key: "typescript",
          slug: "typescript",
          name: "TypeScript",
          description: null,
          alternates: [{ locale: "en", slug: "typescript" }],
        },
        posts.slice(0, 1),
        siteUrl
      )
    ) as Record<string, unknown>;

    expect(json["@type"]).toBe("CollectionPage");
    expect(json.url).toBe("https://example.test/en/blog/tag/typescript");
    expect(json).not.toHaveProperty("description");
  });

  it("numbers breadcrumb steps from one and resolves them absolutely", () => {
    const json = JSON.parse(
      buildBreadcrumbJsonLd(
        [
          { name: "Home", path: "/en" },
          { name: "Blog", path: "/en/blog" },
        ],
        siteUrl
      )
    ) as { itemListElement: { position: number; item: string }[] };

    expect(json.itemListElement.map(({ position }) => position)).toEqual([
      1, 2,
    ]);
    expect(json.itemListElement[1]?.item).toBe("https://example.test/en/blog");
  });

  it("escapes the sequence that could close the script element early", () => {
    const json = buildBreadcrumbJsonLd(
      [{ name: "</script><script>alert(1)</script>", path: "/en" }],
      siteUrl
    );
    expect(json).not.toContain("</script>");
    expect(json).toContain("\\u003c/script");
  });
});
