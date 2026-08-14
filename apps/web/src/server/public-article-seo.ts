import { articlePath } from "../i18n/routing";
import { getSiteUrl } from "../Utils/siteUrl";
import type { PublicArticleDetailItem } from "@portfolio/contracts/blog";
import { getLocaleDefinition, type Locale } from "@portfolio/contracts/common";
import type { Metadata } from "next";

/** Build page metadata from the same published-alternate DTO used by the UI. */
export function buildPublicArticleMetadata(
  locale: Locale,
  article: PublicArticleDetailItem
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
    },
    twitter: {
      card: "summary",
      title: article.seoTitle ?? article.title,
      description: article.seoDescription ?? article.excerpt,
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
  }).replaceAll("<", "\\u003c");
}
