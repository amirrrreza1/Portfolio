import { publicFeedIndexSchema } from "@portfolio/contracts/blog";
import { describe, expect, it } from "vitest";

import {
  buildRssFeed,
  buildSitemapIndex,
  buildUrlSet,
  escapeXml,
  staticLocaleUrls,
  toArticleSitemapUrl,
  toLastmod,
  toTaxonomySitemapUrl,
} from "../src/server/public-blog-feeds";

const siteUrl = new URL("https://example.test");

const feed = publicFeedIndexSchema.parse({
  locale: "en",
  entries: [
    {
      slug: "typed-public-reads",
      title: "Typed public reads & other stories",
      excerpt: "A strict published summary.",
      publishedAt: "2026-08-14T12:00:00.000Z",
      updatedAt: "2026-08-15T09:30:00.000Z",
      authorName: "Example Author",
      categoryKey: "engineering",
      tagKeys: ["typescript"],
      alternates: [
        { locale: "en", slug: "typed-public-reads" },
        { locale: "fa", slug: "خواندن-عمومی-نوعدار" },
      ],
    },
  ],
});

const persianFeed = publicFeedIndexSchema.parse({
  locale: "fa",
  entries: [{ ...feed.entries[0]!, slug: "خواندن-عمومی-نوعدار" }],
});

describe("XML escaping", () => {
  it("escapes every character that can end an element or an attribute", () => {
    // Authored text reaches these documents unaltered. `Q&A` in a title is the
    // ordinary case that produces invalid XML when a field is trusted.
    expect(escapeXml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&apos;");
  });

  it("escapes titles inside a generated feed", () => {
    const xml = buildRssFeed({
      locale: "en",
      siteUrl,
      title: "Blog",
      description: "Articles",
      entries: feed.entries,
    });
    expect(xml).toContain(
      "<title>Typed public reads &amp; other stories</title>"
    );
    expect(xml).not.toContain("reads & other");
  });
});

describe("buildRssFeed", () => {
  it("declares itself, its language, and one permalink guid per item", () => {
    const xml = buildRssFeed({
      locale: "fa",
      siteUrl,
      title: "وبلاگ",
      description: "مقاله‌ها",
      entries: persianFeed.entries,
    });
    // `en` and `fa`, from LOCALE_DEFINITIONS: the site declares one language
    // tag per locale (I18N.md §6) and a feed is not the place to invent a
    // regional variant of it.
    expect(xml).toContain("<language>fa</language>");
    expect(xml).toContain(
      '<atom:link href="https://example.test/fa/blog/feed.xml" rel="self" type="application/rss+xml" />'
    );
    expect(xml).toContain('<guid isPermaLink="true">');
    expect(xml).toContain(
      `<guid isPermaLink="true">https://example.test/fa/blog/${encodeURIComponent(persianFeed.entries[0]!.slug)}</guid>`
    );
    expect(xml).toContain("<dc:creator>Example Author</dc:creator>");
    expect(xml).toContain('xmlns:dc="http://purl.org/dc/elements/1.1/"');
  });

  it("carries the excerpt rather than the rendered body", () => {
    const xml = buildRssFeed({
      locale: "en",
      siteUrl,
      title: "Blog",
      description: "Articles",
      entries: feed.entries,
    });
    expect(xml).toContain(
      "<description>A strict published summary.</description>"
    );
    expect(xml).not.toContain("renderedHtml");
    expect(xml).not.toContain("content:encoded");
  });

  it("emits a valid channel for a locale with no published articles", () => {
    const xml = buildRssFeed({
      locale: "en",
      siteUrl,
      title: "Blog",
      description: "Articles",
      entries: [],
    });
    expect(xml).toContain("<channel>");
    expect(xml).not.toContain("<item>");
    expect(xml).not.toContain("<lastBuildDate>");
  });
});

describe("sitemap generation", () => {
  it("emits the article's own alternate group, plus x-default for English", () => {
    // The same list the page emits as `hreflang`. Generating them from one DTO
    // is what makes "identical to page metadata" a property rather than a hope.
    const url = toArticleSitemapUrl("fa", persianFeed.entries[0]!, siteUrl);
    expect(url.loc).toBe(
      `https://example.test/fa/blog/${encodeURIComponent("خواندن-عمومی-نوعدار")}`
    );
    expect(url.lastmod).toBe("2026-08-15T09:30:00.000Z");
    expect(url.alternates?.map(({ hreflang }) => hreflang)).toEqual([
      "en",
      "fa",
      "x-default",
    ]);
  });

  it("derives lastmod from the recorded update time and drops an unparsable one", () => {
    expect(toLastmod("2026-08-15T09:30:00.000Z")).toBe(
      "2026-08-15T09:30:00.000Z"
    );
    expect(toLastmod("not a date")).toBeUndefined();
  });

  it("writes alternates as xhtml:link inside each url element", () => {
    const xml = buildUrlSet([
      toArticleSitemapUrl("en", feed.entries[0]!, siteUrl),
    ]);
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="x-default" href="https://example.test/en/blog/typed-public-reads" />'
    );
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });

  it("gives a taxonomy page the alternate group its own DTO carries", () => {
    const url = toTaxonomySitemapUrl(
      "en",
      "tag",
      {
        slug: "typescript",
        alternates: [
          { locale: "en", slug: "typescript" },
          { locale: "fa", slug: "تایپ-اسکریپت" },
        ],
      },
      siteUrl
    );
    expect(url.loc).toBe("https://example.test/en/blog/tag/typescript");
    expect(url.alternates).toHaveLength(3);
  });

  it("lists an English portfolio and language-scoped blogs", () => {
    const urls = staticLocaleUrls("en", siteUrl);
    expect(urls.map(({ loc }) => loc)).toEqual([
      "https://example.test/",
      "https://example.test/projects",
      "https://example.test/en/blog",
    ]);
    expect(urls[0]?.alternates).toEqual([]);
    expect(urls[2]?.alternates?.map(({ hreflang }) => hreflang)).toEqual([
      "en",
      "fa",
      "x-default",
    ]);
    expect(staticLocaleUrls("fa", siteUrl).map(({ loc }) => loc)).toEqual([
      "https://example.test/fa/blog",
    ]);
  });

  it("indexes one sitemap per locale", () => {
    const xml = buildSitemapIndex([
      { loc: "https://example.test/en/sitemap.xml" },
      { loc: "https://example.test/fa/sitemap.xml" },
    ]);
    expect(xml).toContain("<sitemapindex");
    expect(xml).toContain("<loc>https://example.test/fa/sitemap.xml</loc>");
  });
});
