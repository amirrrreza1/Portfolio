import { formatNumber, formatPublicTimestamp } from "@/i18n/format";
import { getMessages } from "@/i18n/messages";
import { articlePath, blogTaxonomyPath } from "@/i18n/routing";
import type {
  PublicArticleSummary,
  PublicTaxonomySummary,
} from "@portfolio/contracts/blog";
import type { Locale } from "@portfolio/contracts/common";
import Link from "next/link";

/**
 * The article card, rendered identically by the index, the taxonomy pages, and
 * the related-articles block.
 *
 * One component rather than three, because these lists are the human
 * navigation path SEO.md requires to reach every indexable post: a card that
 * stopped linking the article on one surface and not the others would leave
 * exactly the sitemap-only orphan that rule exists to prevent.
 *
 * Taxonomy chips are rendered from `categoryKey`/`tagKeys` only when the term
 * has a slug in this locale. A key is a stable internal handle and is not a
 * URL; linking one that has no localized slug would produce a `404` for a
 * category the reader can plainly see named on the card.
 */
/**
 * The key-to-localized-term lookup the cards need.
 *
 * Built once per render from the navigation index so a card never has to ask
 * for a term of its own, and so a key with no translation in this locale is
 * simply absent rather than rendered as an unlinked internal handle.
 */
export function buildTaxonomySlugs(index: {
  readonly categories: readonly PublicTaxonomySummary[];
  readonly tags: readonly PublicTaxonomySummary[];
}): TaxonomySlugs {
  const toRecord = (terms: readonly PublicTaxonomySummary[]) =>
    Object.fromEntries(
      terms.map((term) => [term.key, { name: term.name, slug: term.slug }])
    );
  return { categories: toRecord(index.categories), tags: toRecord(index.tags) };
}

export interface TaxonomySlugs {
  readonly categories: Readonly<
    Record<string, { readonly name: string; readonly slug: string }>
  >;
  readonly tags: Readonly<
    Record<string, { readonly name: string; readonly slug: string }>
  >;
}

export function ArticleSummaryList({
  locale,
  posts,
  headingLevel = "h2",
  taxonomy,
}: {
  readonly locale: Locale;
  readonly posts: readonly PublicArticleSummary[];
  readonly headingLevel?: "h2" | "h3";
  readonly taxonomy?: TaxonomySlugs;
}) {
  const messages = getMessages(locale).blog;
  const Heading = headingLevel;

  return (
    <ol className="space-y-6">
      {posts.map((article) => {
        const category =
          article.categoryKey === null
            ? undefined
            : taxonomy?.categories[article.categoryKey];
        const tags = article.tagKeys.flatMap((key) => {
          const tag = taxonomy?.tags[key];
          return tag === undefined ? [] : [tag];
        });

        return (
          <li key={article.id} className="border-border border p-5">
            <article className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <Heading className="text-2xl font-semibold">
                  <Link
                    href={articlePath(locale, article.slug)}
                    className="underline-offset-4 hover:underline"
                  >
                    {article.title}
                  </Link>
                </Heading>
                {article.featured ? (
                  <span className="border-border bg-surface border px-2 py-1 text-sm">
                    {messages.featured}
                  </span>
                ) : null}
              </div>
              <p className="text-text-muted">{article.excerpt}</p>
              <p className="text-text-muted flex flex-wrap gap-2 text-sm">
                <time dateTime={article.publishedAt}>
                  {formatPublicTimestamp(article.publishedAt, locale)}
                </time>
                <span aria-hidden="true">·</span>
                <span>
                  {formatNumber(article.readingMinutes, locale)}{" "}
                  {messages.minuteRead}
                </span>
              </p>
              {category === undefined && tags.length === 0 ? null : (
                <p className="flex flex-wrap gap-3 text-sm">
                  {category === undefined ? null : (
                    <Link
                      href={blogTaxonomyPath(locale, "category", category.slug)}
                      className="border-border border px-2 py-1 underline-offset-4 hover:underline"
                    >
                      <span className="sr-only">
                        {messages.categoryLabel}:{" "}
                      </span>
                      {category.name}
                    </Link>
                  )}
                  {tags.map((tag) => (
                    <Link
                      key={tag.slug}
                      href={blogTaxonomyPath(locale, "tag", tag.slug)}
                      className="border-border border px-2 py-1 underline-offset-4 hover:underline"
                    >
                      <span className="sr-only">{messages.tagLabel}: </span>
                      {tag.name}
                    </Link>
                  ))}
                </p>
              )}
              <Link
                href={articlePath(locale, article.slug)}
                className="inline-block underline"
              >
                {messages.readArticle}
              </Link>
            </article>
          </li>
        );
      })}
    </ol>
  );
}
