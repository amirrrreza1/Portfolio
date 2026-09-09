import {
  getPortfolioFeedEntries,
  getPortfolioTaxonomyIndex,
} from "@/server/portfolio-blog-discovery";
import { getPortfolioProjects } from "@/server/portfolio-projects";
import {
  buildUrlSet,
  staticLocaleUrls,
  toArticleSitemapUrl,
  toTaxonomySitemapUrl,
  type SitemapUrl,
} from "@/server/public-blog-feeds";
import { PublicDataUnavailableError } from "@/server/public-api-client";
import { getSiteUrl } from "@/Utils/siteUrl";
import { isLocale } from "@portfolio/contracts/common";
import { NextResponse } from "next/server";

/**
 * One sitemap per locale.
 *
 * It contains only canonical, successful, published URLs
 * ([SEO.md](../../../../../docs/SEO.md)): the locale's static pages, its
 * published projects, its published articles, and the taxonomy pages that
 * actually have at least one discoverable article. Cursor pages are absent by
 * construction — they are `noindex` and their contents shift — and so is
 * anything the article listing already excludes for source or render
 * integrity, because every entry here comes from `feed-index`.
 *
 * Article and taxonomy alternates are the same sets the corresponding pages
 * emit as `hreflang`, because both are generated from the same DTO.
 */
export async function GET(
  _request: Request,
  context: { readonly params: Promise<{ locale: string }> }
): Promise<NextResponse> {
  const { locale } = await context.params;
  if (!isLocale(locale)) return new NextResponse(null, { status: 404 });
  const siteUrl = getSiteUrl();

  let reads;
  try {
    reads = await Promise.all([
      getPortfolioFeedEntries(locale),
      getPortfolioTaxonomyIndex(locale),
      // Portfolio pages are English-only; the Persian sitemap contains blog
      // content and no portfolio translations.
      locale === "en"
        ? getPortfolioProjects("en")
        : Promise.resolve({ projects: [] }),
    ]);
  } catch (error) {
    if (!(error instanceof PublicDataUnavailableError)) throw error;
    return new NextResponse(null, {
      status: 503,
      headers: { "Retry-After": "60", "Cache-Control": "no-store" },
    });
  }

  const [entries, taxonomy, projects] = reads;
  const urls: SitemapUrl[] = [
    ...staticLocaleUrls(locale, siteUrl),
    ...projects.projects.map((project) => ({
      loc: new URL(
        `/projects/${encodeURIComponent(project.slug)}`,
        siteUrl
      ).toString(),
      alternates: [],
    })),
    ...taxonomy.categories.map((term) =>
      toTaxonomySitemapUrl(locale, "category", term, siteUrl)
    ),
    ...taxonomy.tags.map((term) =>
      toTaxonomySitemapUrl(locale, "tag", term, siteUrl)
    ),
    ...entries.map((entry) => toArticleSitemapUrl(locale, entry, siteUrl)),
  ];

  return new NextResponse(buildUrlSet(urls), {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control":
        "public, max-age=0, s-maxage=300, stale-while-revalidate=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
