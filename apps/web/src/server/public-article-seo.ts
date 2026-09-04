import { articlePath } from "../i18n/routing";

/**
 * The generated share card's size and type.
 *
 * Declared here rather than only in the route so the metadata cannot promise
 * dimensions the renderer does not produce — a share card whose declared size
 * is wrong is cropped by the consumer, which is the failure this replaces.
 */
export const SHARE_IMAGE_SIZE = { width: 1200, height: 630 } as const;
export const SHARE_IMAGE_TYPE = "image/png";

/**
 * Whether a share card can be *generated* for this locale.
 *
 * The card is rendered by satori, which lays out glyphs without a text shaper:
 * it has no Arabic joining and no bidi reordering, so Persian comes out as
 * disconnected letters in visual order. That is worse than no card — a broken
 * one is shown to every reader who shares the article — so Persian articles
 * use the author's chosen image or nothing, and the generated fallback is
 * offered only where the renderer is faithful to the script.
 *
 * Removing this is a matter of shaping the text before it reaches satori;
 * until then, the honest behaviour is to decline.
 */
export function canGenerateShareCard(locale: Locale): boolean {
  return getLocaleDefinition(locale).direction === "ltr";
}

/** Where the generated card for one article lives. */
export function shareImagePath(
  locale: Parameters<typeof articlePath>[0],
  slug: string
): string {
  return `${articlePath(locale, slug)}/share-image`;
}
import { getSiteUrl } from "../Utils/siteUrl";
import type { PublicArticleDetailItem } from "@portfolio/contracts/blog";
import { getLocaleDefinition, type Locale } from "@portfolio/contracts/common";
import type { Metadata } from "next";

/** Build page metadata from the same published-alternate DTO used by the UI. */
export function buildPublicArticleMetadata(
  locale: Locale,
  article: PublicArticleDetailItem,
  siteUrl: URL = getSiteUrl()
): Metadata {
  const localPath = articlePath(locale, article.slug);
  const alternateLanguages = Object.fromEntries(
    article.alternates.map((alternate) => [
      alternate.locale,
      articlePath(alternate.locale, alternate.slug),
    ])
  );
  const english = article.alternates.find(
    ({ locale: alternateLocale }) => alternateLocale === "en"
  );
  if (english) {
    alternateLanguages["x-default"] = articlePath("en", english.slug);
  }

  // Absolute, because a social crawler does not resolve a site-relative
  // `og:image` against the page it found it on reliably enough to depend on.
  //
  // Every article has one. An author who chose a social image or a cover gets
  // that; an author who chose neither gets a card generated from this
  // article's own title and date, because SEO.md §3 asks for an Open Graph
  // image with alt text on every indexable page and an article with no share
  // image is the one that renders as a bare grey rectangle in the place it
  // gets read most.
  const socialImage =
    article.socialImage === null
      ? canGenerateShareCard(locale)
        ? [
            {
              url: new URL(
                shareImagePath(locale, article.slug),
                siteUrl
              ).toString(),
              alt: article.seoTitle ?? article.title,
              type: SHARE_IMAGE_TYPE,
              width: SHARE_IMAGE_SIZE.width,
              height: SHARE_IMAGE_SIZE.height,
            },
          ]
        : undefined
      : [
          {
            url: new URL(article.socialImage.src, siteUrl).toString(),
            alt: article.socialImage.altText,
            type: article.socialImage.mimeType,
            ...(article.socialImage.width === null ||
            article.socialImage.height === null
              ? {}
              : {
                  width: article.socialImage.width,
                  height: article.socialImage.height,
                }),
          },
        ];

  return {
    title: article.seoTitle ?? article.title,
    description: article.seoDescription ?? article.excerpt,
    authors: article.authorName ? [{ name: article.authorName }] : undefined,
    alternates: {
      canonical: article.canonicalUrl ?? localPath,
      languages: alternateLanguages,
    },
    openGraph: {
      type: "article",
      locale,
      alternateLocale: article.alternates
        .filter(({ locale: alternateLocale }) => alternateLocale !== locale)
        .map(({ locale: alternateLocale }) => alternateLocale),
      url: article.canonicalUrl ?? localPath,
      title: article.seoTitle ?? article.title,
      description: article.seoDescription ?? article.excerpt,
      publishedTime: article.publishedAt,
      modifiedTime: article.updatedAt,
      authors: article.authorName ? [article.authorName] : undefined,
      tags: article.tagKeys,
      ...(socialImage === undefined ? {} : { images: socialImage }),
    },
    twitter: {
      // `summary_large_image` only when there is actually an image: the large
      // card renders a broken frame rather than falling back, so the card type
      // follows the content rather than the wish.
      card: socialImage === undefined ? "summary" : "summary_large_image",
      title: article.seoTitle ?? article.title,
      description: article.seoDescription ?? article.excerpt,
      ...(socialImage === undefined ? {} : { images: socialImage }),
    },
  };
}

/** Serialize safe BlogPosting JSON-LD for a nonce-bearing script element. */
export function buildPublicArticleJsonLd(
  locale: Locale,
  article: PublicArticleDetailItem,
  siteUrl: URL = getSiteUrl()
): string {
  const canonical =
    article.canonicalUrl ??
    new URL(articlePath(locale, article.slug), siteUrl).toString();
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: article.title,
    description: article.seoDescription ?? article.excerpt,
    mainEntityOfPage: canonical,
    datePublished: article.publishedAt,
    dateModified: article.updatedAt,
    inLanguage: getLocaleDefinition(locale).bcp47,
    ...(article.authorName
      ? { author: { "@type": "Person", name: article.authorName } }
      : {}),
    ...(article.tagKeys.length > 0 ? { keywords: article.tagKeys } : {}),
    ...(article.socialImage === null && !canGenerateShareCard(locale)
      ? {}
      : {
          image: new URL(
            article.socialImage?.src ?? shareImagePath(locale, article.slug),
            siteUrl
          ).toString(),
        }),
  }).replaceAll("<", "\\u003c");
}
