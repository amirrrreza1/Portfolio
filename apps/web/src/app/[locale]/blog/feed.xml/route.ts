import { getMessages } from "@/i18n/messages";
import { getPortfolioFeedEntries } from "@/server/portfolio-blog-discovery";
import { buildRssFeed } from "@/server/public-blog-feeds";
import { PublicDataUnavailableError } from "@/server/public-api-client";
import { getSiteUrl } from "@/Utils/siteUrl";
import { isLocale } from "@portfolio/contracts/common";
import { NextResponse } from "next/server";

/**
 * One RSS feed per locale, generated from the same `feed-index` read that
 * produces the sitemap and the index page's structured data.
 *
 * A feed is a cache-friendly public document, so it is served with the public
 * cache headers rather than the private ones the proxy applies to HTML: a
 * reader polls this every few minutes and a shared cache should be allowed to
 * absorb that.
 *
 * An outage answers `503` with `Retry-After` rather than an empty channel.
 * An empty feed is indistinguishable from "this blog has no articles", and a
 * subscriber's client would treat every existing item as withdrawn.
 */
export async function GET(
  _request: Request,
  context: { readonly params: Promise<{ locale: string }> }
): Promise<NextResponse> {
  const { locale } = await context.params;
  if (!isLocale(locale)) return new NextResponse(null, { status: 404 });
  const messages = getMessages(locale).blog;

  let entries;
  try {
    entries = await getPortfolioFeedEntries(locale);
  } catch (error) {
    if (!(error instanceof PublicDataUnavailableError)) throw error;
    return new NextResponse(null, {
      status: 503,
      headers: { "Retry-After": "60", "Cache-Control": "no-store" },
    });
  }

  return new NextResponse(
    buildRssFeed({
      locale,
      siteUrl: getSiteUrl(),
      title: messages.title,
      description: messages.description,
      entries,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Content-Language": locale,
        "Cache-Control":
          "public, max-age=0, s-maxage=300, stale-while-revalidate=3600",
        "X-Content-Type-Options": "nosniff",
      },
    }
  );
}
