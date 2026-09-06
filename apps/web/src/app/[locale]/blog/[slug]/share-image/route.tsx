import { formatPublicTimestamp } from "@/i18n/format";
import { decodeSlugParam } from "@/i18n/routing";
import { getPortfolioArticleDetail } from "@/server/portfolio-article-detail";
import { PublicDataUnavailableError } from "@/server/public-api-client";
import {
  canGenerateShareCard,
  SHARE_IMAGE_SIZE,
  SHARE_IMAGE_TYPE,
} from "@/server/public-article-seo";
import { THEME_TOKENS } from "@portfolio/contracts/appearance";
import { isLocale, slugSchemaFor } from "@portfolio/contracts/common";
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * The generated share card for an article whose author chose no image.
 *
 * An explicit route rather than Next's `opengraph-image` convention: the
 * metadata already decides between the author's image and this one, and the
 * convention would inject a second `og:image` alongside that decision. What is
 * advertised and what is served therefore come from the same branch.
 *
 * Rendered by satori, which reads TTF and OTF only — the site's faces ship as
 * `woff2`, so `src/assets/og` carries TTF copies of the two families a card
 * can need, and `next.config.ts` traces them into the standalone output.
 * Persian and English are both real cases here: a card with tofu in it is
 * worse than no card.
 */
type RouteParams = Promise<{ locale: string; slug: string }>;

export async function GET(
  _request: Request,
  { params }: Readonly<{ params: RouteParams }>
): Promise<Response> {
  const { locale, slug: slugInput } = await params;
  // The same predicate the metadata uses, so a card is never advertised and
  // then missing, or served and never advertised.
  if (!isLocale(locale) || !canGenerateShareCard(locale)) {
    return new Response("Not found", { status: 404 });
  }
  const decoded = decodeSlugParam(slugInput);
  if (decoded === null) return new Response("Not found", { status: 404 });
  const slug = slugSchemaFor(locale).safeParse(decoded);
  if (!slug.success) return new Response("Not found", { status: 404 });

  let article;
  try {
    article = (await getPortfolioArticleDetail(locale, slug.data)).article;
  } catch (error) {
    if (!(error instanceof PublicDataUnavailableError)) throw error;
    return new Response("Service unavailable", {
      status: 503,
      headers: { "retry-after": "120", "cache-control": "no-store" },
    });
  }
  // A card for an article nobody can read would be a way to confirm that a
  // draft exists, so this answers exactly what the article route answers.
  if (article === null) return new Response("Not found", { status: 404 });

  // The site's own dark palette, from the token contract rather than spelled
  // here. A card is not a component and cannot resolve a CSS variable, but
  // "the brand colours" is still one decision, made in one place — and
  // THEMING.md §3 forbids naming a raw colour in a source file for exactly the
  // reason that would otherwise apply here.
  const palette = THEME_TOKENS.dark;
  const [latin, bold] = await Promise.all([
    loadFont("JetBrainsMono-Regular.ttf"),
    loadFont("JetBrainsMono-Bold.ttf"),
  ]);

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        padding: 72,
        backgroundColor: palette.bg,
        color: palette.text,
        fontFamily: "JetBrains Mono",
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 56,
          fontWeight: 700,
          lineHeight: 1.25,
          // satori has no ellipsis: the box is what bounds a long title.
          maxHeight: 380,
          overflow: "hidden",
        }}
      >
        {article.seoTitle ?? article.title}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 26,
          opacity: 0.8,
        }}
      >
        <span>{formatPublicTimestamp(article.publishedAt, locale)}</span>
        {article.authorName === null ? null : <span>{article.authorName}</span>}
      </div>
    </div>,
    {
      width: SHARE_IMAGE_SIZE.width,
      height: SHARE_IMAGE_SIZE.height,
      headers: {
        "content-type": SHARE_IMAGE_TYPE,
        "cache-control": "public, max-age=0, s-maxage=300",
      },
      fonts: [
        { name: "JetBrains Mono", data: latin, weight: 400, style: "normal" },
        { name: "JetBrains Mono", data: bold, weight: 700, style: "normal" },
      ],
    }
  );
}

async function loadFont(file: string): Promise<ArrayBuffer> {
  const bytes = await readFile(
    path.join(process.cwd(), "src", "assets", "og", file)
  );
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}
