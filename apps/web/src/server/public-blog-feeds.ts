import { articlePath, blogTaxonomyPath, localePath } from "../i18n/routing";
import type { PublicFeedEntry } from "@portfolio/contracts/blog";
import {
  getLocaleDefinition,
  LOCALES,
  type Locale,
} from "@portfolio/contracts/common";

/**
 * RSS and sitemap serialization.
 *
 * Pure functions over already-validated DTOs, taking the site origin as an
 * argument. Serializing XML is exactly the kind of code that is only ever
 * wrong in production — a stray `&` in a title, a `lastmod` in the wrong
 * format, an alternate set that does not match the page — so it is kept free
 * of I/O and asserted directly.
 *
 * Escaping is applied to every interpolated value without exception, including
 * ones that "cannot" contain a special character. An article title is authored
 * text, and the day someone writes `Q&A` is not the day to discover which
 * fields were trusted.
 */

const XML_ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

export function escapeXml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) => XML_ESCAPES[character] ?? character
  );
}

export interface SitemapAlternate {
  readonly hreflang: string;
  readonly href: string;
}

export interface SitemapUrl {
  readonly loc: string;
  readonly lastmod?: string | undefined;
  readonly alternates?: readonly SitemapAlternate[] | undefined;
}

/**
 * `lastmod` as the sitemap protocol wants it.
 *
 * W3C datetime, from the translation's own realized publish/update time.
 * [SEO.md](../../../../docs/SEO.md) requires it to derive from a meaningful
 * published change and never from a reconciliation timestamp, which is why
 * every caller passes a value that came out of the feed index rather than
 * `new Date()`.
 */
export function toLastmod(value: string): string | undefined {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

export function buildUrlSet(urls: readonly SitemapUrl[]): string {
  const body = urls
    .map((url) => {
      const alternates = (url.alternates ?? [])
        .map(
          (alternate) =>
            `    <xhtml:link rel="alternate" hreflang="${escapeXml(alternate.hreflang)}" href="${escapeXml(alternate.href)}" />`
        )
        .join("\n");
      return [
        "  <url>",
        `    <loc>${escapeXml(url.loc)}</loc>`,
        ...(url.lastmod === undefined
          ? []
          : [`    <lastmod>${escapeXml(url.lastmod)}</lastmod>`]),
        ...(alternates === "" ? [] : [alternates]),
        "  </url>",
      ].join("\n");
    })
    .join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    body,
    "</urlset>",
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function buildSitemapIndex(
  entries: readonly {
    readonly loc: string;
    readonly lastmod?: string | undefined;
  }[]
): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map((entry) =>
      [
        "  <sitemap>",
        `    <loc>${escapeXml(entry.loc)}</loc>`,
        ...(entry.lastmod === undefined
          ? []
          : [`    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`]),
        "  </sitemap>",
      ].join("\n")
    ),
    "</sitemapindex>",
    "",
  ].join("\n");
}

/**
 * One locale's RSS channel.
 *
 * A summary feed: `description` carries the article's excerpt and nothing
 * else. Syndicating the rendered body would mean maintaining a second
 * sanitization boundary for consumers nobody controls, and the excerpt is
 * already the author's own summary.
 *
 * `guid` is the canonical article URL and `isPermaLink` says so. A slug change
 * therefore produces a new item rather than silently rewriting an old one in
 * every reader that already has it — which is the honest outcome, because the
 * old URL still resolves through the slug redirect.
 */
export function buildRssFeed(input: {
  readonly locale: Locale;
  readonly siteUrl: URL;
  readonly title: string;
  readonly description: string;
  readonly entries: readonly PublicFeedEntry[];
}): string {
  const { locale, siteUrl } = input;
  const channelLink = new URL(localePath(locale, "blog"), siteUrl).toString();
  const selfLink = new URL(
    localePath(locale, "blog/feed.xml"),
    siteUrl
  ).toString();
  const latest = input.entries[0];

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    "  <channel>",
    `    <title>${escapeXml(input.title)}</title>`,
    `    <link>${escapeXml(channelLink)}</link>`,
    `    <description>${escapeXml(input.description)}</description>`,
    `    <language>${escapeXml(getLocaleDefinition(locale).bcp47)}</language>`,
    `    <atom:link href="${escapeXml(selfLink)}" rel="self" type="application/rss+xml" />`,
    ...(latest === undefined
      ? []
      : [
          `    <lastBuildDate>${escapeXml(new Date(latest.updatedAt).toUTCString())}</lastBuildDate>`,
        ]),
    ...input.entries.map((entry) => {
      const link = new URL(articlePath(locale, entry.slug), siteUrl).toString();
      return [
        "    <item>",
        `      <title>${escapeXml(entry.title)}</title>`,
        `      <link>${escapeXml(link)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
        `      <description>${escapeXml(entry.excerpt)}</description>`,
        `      <pubDate>${escapeXml(new Date(entry.publishedAt).toUTCString())}</pubDate>`,
        ...(entry.authorName === null
          ? []
          : [`      <dc:creator>${escapeXml(entry.authorName)}</dc:creator>`]),
        ...entry.tagKeys.map(
          (key) => `      <category>${escapeXml(key)}</category>`
        ),
        "    </item>",
      ].join("\n");
    }),
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}

/**
 * The sitemap entry for one article, with the alternate set the page emits.
 *
 * Built from `feed-index` alternates so the `xhtml:link` group and the page's
 * `hreflang` group are the same list rather than two lists that happen to
 * agree today. `x-default` points at English when English is published, which
 * is the same rule the article page applies.
 */
export function toArticleSitemapUrl(
  locale: Locale,
  entry: PublicFeedEntry,
  siteUrl: URL
): SitemapUrl {
  const alternates: SitemapAlternate[] = entry.alternates.map((alternate) => ({
    hreflang: alternate.locale,
    href: new URL(
      articlePath(alternate.locale, alternate.slug),
      siteUrl
    ).toString(),
  }));
  const english = entry.alternates.find(
    ({ locale: alternateLocale }) => alternateLocale === "en"
  );
  if (english) {
    alternates.push({
      hreflang: "x-default",
      href: new URL(articlePath("en", english.slug), siteUrl).toString(),
    });
  }
  return {
    loc: new URL(articlePath(locale, entry.slug), siteUrl).toString(),
    lastmod: toLastmod(entry.updatedAt),
    alternates,
  };
}

/** The same rule for a taxonomy page, whose alternates come from its own DTO. */
export function toTaxonomySitemapUrl(
  locale: Locale,
  kind: "category" | "tag",
  term: {
    readonly slug: string;
    readonly alternates: readonly {
      readonly locale: Locale;
      readonly slug: string;
    }[];
  },
  siteUrl: URL
): SitemapUrl {
  const alternates: SitemapAlternate[] = term.alternates.map((alternate) => ({
    hreflang: alternate.locale,
    href: new URL(
      blogTaxonomyPath(alternate.locale, kind, alternate.slug),
      siteUrl
    ).toString(),
  }));
  const english = term.alternates.find(
    ({ locale: alternateLocale }) => alternateLocale === "en"
  );
  if (english) {
    alternates.push({
      hreflang: "x-default",
      href: new URL(
        blogTaxonomyPath("en", kind, english.slug),
        siteUrl
      ).toString(),
    });
  }
  return {
    loc: new URL(blogTaxonomyPath(locale, kind, term.slug), siteUrl).toString(),
    alternates,
  };
}

/**
 * The static locale-prefixed routes that exist regardless of content.
 *
 * They carry the full alternate set unconditionally because they are
 * published in both locales by construction — there is no draft state for the
 * home page.
 */
export function staticLocaleUrls(locale: Locale, siteUrl: URL): SitemapUrl[] {
  const paths = ["", "projects", "blog"] as const;
  return paths.map((path) => ({
    loc: new URL(localePath(locale, path), siteUrl).toString(),
    alternates: [
      ...LOCALES.map((alternateLocale) => ({
        hreflang: alternateLocale,
        href: new URL(localePath(alternateLocale, path), siteUrl).toString(),
      })),
      {
        hreflang: "x-default",
        href: new URL(localePath("en", path), siteUrl).toString(),
      },
    ],
  }));
}
