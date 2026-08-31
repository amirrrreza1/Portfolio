import { buildSitemapIndex } from "@/server/public-blog-feeds";
import { getSiteUrl } from "@/Utils/siteUrl";
import { LOCALES } from "@portfolio/contracts/common";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * The sitemap index, which is what `robots.txt` points at.
 *
 * Split per locale rather than emitted as one file: the two locales are
 * generated from independent reads, so a locale whose data is briefly
 * unavailable answers `503` on its own sitemap instead of taking the other
 * locale's URLs down with it. The index itself needs no data at all and
 * therefore cannot fail.
 */
export function GET(): NextResponse {
  const siteUrl = getSiteUrl();
  return new NextResponse(
    buildSitemapIndex(
      LOCALES.map((locale) => ({
        loc: new URL(`/${locale}/sitemap.xml`, siteUrl).toString(),
      }))
    ),
    {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control":
          "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
        "X-Content-Type-Options": "nosniff",
      },
    }
  );
}
