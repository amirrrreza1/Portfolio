import { getSiteUrl } from "@/Utils/siteUrl";
import { NextResponse } from "next/server";

/**
 * `robots.txt`, per [SEO.md](../../../../docs/SEO.md).
 *
 * It names the canonical sitemap and blocks nothing a renderer needs — no CSS,
 * no images, no `_next` assets — because a crawler that cannot fetch the
 * stylesheet judges the page it cannot lay out.
 *
 * What it does disallow is everything that is already `noindex` for a reason:
 * the admin panel and its previews, and the public API. That is defence in
 * depth rather than the control itself; the admin surface sends
 * `X-Robots-Tag: noindex, nofollow, noarchive` on every response, because a
 * `robots.txt` rule is a request and a header is an instruction.
 */
export function GET(): NextResponse {
  const siteUrl = getSiteUrl();
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /api/",
    "",
    `Sitemap: ${new URL("/sitemap.xml", siteUrl).toString()}`,
    "",
  ].join("\n");

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control":
        "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
