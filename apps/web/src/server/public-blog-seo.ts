import { articlePath, blogTaxonomyPath, localePath } from "../i18n/routing";
import { getSiteUrl } from "../Utils/siteUrl";
import type {
  PublicArticleSummary,
  PublicFeedEntry,
  PublicTaxonomy,
} from "@portfolio/contracts/blog";
import { getLocaleDefinition, type Locale } from "@portfolio/contracts/common";

/**
 * Structured data and link relations for the blog's discovery surfaces.
 *
 * Every URL here is absolute and built from `getSiteUrl()`, because structured
 * data is consumed outside the document that carried it and a relative value
 * has no page to resolve against once it has been extracted.
 *
 * Every serializer escapes `<`. JSON-LD is injected into a `<script>` element,
 * and the one sequence that can end that element early is `</`; escaping the
 * angle bracket makes the payload inert regardless of what an author typed
 * into a title.
 */

function serialize(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

export interface BreadcrumbStep {
  readonly name: string;
  readonly path: string;
}

/**
 * A breadcrumb trail as structured data.
 *
 * Emitted from the same `path` values the visible navigation uses. Structured
 * data that describes a path the page does not actually offer is a
 * disagreement between what a crawler is told and what a reader can do, and
 * search engines treat that as a defect rather than as extra information.
 */
export function buildBreadcrumbJsonLd(
  steps: readonly BreadcrumbStep[],
  siteUrl: URL = getSiteUrl()
): string {
  return serialize({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: steps.map((step, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: step.name,
      item: new URL(step.path, siteUrl).toString(),
    })),
  });
}

/**
 * The blog index as a `Blog` with its published posts listed in order.
 *
 * Built from feed entries rather than from the rendered page, so the list a
 * crawler reads is the same set the sitemap and the RSS feed contain — all
 * three come from `feed-index`, which is the only read that excludes
 * translations with incomplete source or render integrity.
 */
export function buildBlogIndexJsonLd(
  locale: Locale,
  input: {
    readonly title: string;
    readonly description: string;
    readonly entries: readonly PublicFeedEntry[];
  },
  siteUrl: URL = getSiteUrl()
): string {
  return serialize({
    "@context": "https://schema.org",
    "@type": "Blog",
    name: input.title,
    description: input.description,
    inLanguage: getLocaleDefinition(locale).bcp47,
    url: new URL(localePath(locale, "blog"), siteUrl).toString(),
    blogPost: input.entries.map((entry) => ({
      "@type": "BlogPosting",
      headline: entry.title,
      description: entry.excerpt,
      datePublished: entry.publishedAt,
      dateModified: entry.updatedAt,
      url: new URL(articlePath(locale, entry.slug), siteUrl).toString(),
      ...(entry.authorName
        ? { author: { "@type": "Person", name: entry.authorName } }
        : {}),
    })),
  });
}

/** A category or tag page as a `CollectionPage` over the posts it lists. */
export function buildTaxonomyJsonLd(
  locale: Locale,
  taxonomy: PublicTaxonomy,
  posts: readonly PublicArticleSummary[],
  siteUrl: URL = getSiteUrl()
): string {
  const url = new URL(
    blogTaxonomyPath(locale, taxonomy.kind, taxonomy.slug),
    siteUrl
  ).toString();
  return serialize({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: taxonomy.name,
    ...(taxonomy.description === null
      ? {}
      : { description: taxonomy.description }),
    inLanguage: getLocaleDefinition(locale).bcp47,
    url,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: posts.map((post, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: new URL(articlePath(locale, post.slug), siteUrl).toString(),
        name: post.title,
      })),
    },
  });
}

/**
 * Related articles, chosen by what the author actually declared.
 *
 * [PRODUCT_SPEC.md](../../../../docs/PRODUCT_SPEC.md) §—discovery requires
 * related links selected by explicit tags and categories "rather than visitor
 * profiling", so this is a pure function of two article records and nothing
 * else: no session, no history, no behavioural signal, and therefore nothing
 * that changes between two visitors reading the same page.
 *
 * A shared category outweighs a shared tag because a category is exclusive —
 * an article has one — while tags are cheap and an author may attach several.
 * Ties break on recency, and an article with nothing in common is never
 * padding: an empty related list is an honest answer.
 */
export function selectRelatedArticles(
  current: {
    readonly slug: string;
    readonly categoryKey: string | null;
    readonly tagKeys: readonly string[];
  },
  candidates: readonly PublicArticleSummary[],
  limit = 3
): readonly PublicArticleSummary[] {
  const tags = new Set(current.tagKeys);
  return candidates
    .filter((candidate) => candidate.slug !== current.slug)
    .map((candidate) => ({
      candidate,
      score:
        (current.categoryKey !== null &&
        candidate.categoryKey === current.categoryKey
          ? 3
          : 0) + candidate.tagKeys.filter((key) => tags.has(key)).length,
    }))
    .filter(({ score }) => score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        Date.parse(right.candidate.publishedAt) -
          Date.parse(left.candidate.publishedAt)
    )
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}
