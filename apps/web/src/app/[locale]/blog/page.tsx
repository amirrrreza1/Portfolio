import {
  ArticleSummaryList,
  buildTaxonomySlugs,
} from "@/features/blog/ArticleSummaryList";
import { getMessages } from "@/i18n/messages";
import { blogIndexPath, blogTaxonomyPath, localePath } from "@/i18n/routing";
import {
  getPortfolioTaxonomyIndex,
  getPortfolioFeedEntries,
} from "@/server/portfolio-blog-discovery";
import { getPortfolioArticlePage } from "@/server/portfolio-articles";
import { buildBlogIndexJsonLd } from "@/server/public-blog-seo";
import { PublicDataUnavailableError } from "@/server/public-api-client";
import { cursorSchema, isLocale } from "@portfolio/contracts/common";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

type RouteParams = Promise<{ locale: string }>;
type RouteSearch = Promise<Record<string, string | string[] | undefined>>;

/** The blog index and the feed it advertises share one locale-scoped path. */
function feedPath(locale: "en" | "fa"): string {
  return localePath(locale, "blog/feed.xml");
}

function readCursor(
  search: Record<string, string | string[] | undefined>
): string | null {
  const raw = search.cursor;
  if (raw === undefined) return null;
  // An array means the query string carried `?cursor=…&cursor=…`. There is no
  // sensible page that names two positions, so it is a bad request rather than
  // a reason to pick one.
  const parsed = cursorSchema.safeParse(Array.isArray(raw) ? undefined : raw);
  return parsed.success ? parsed.data : null;
}

export async function generateMetadata({
  params,
  searchParams,
}: Readonly<{
  params: RouteParams;
  searchParams: RouteSearch;
}>): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const messages = getMessages(locale).blog;
  const cursor = readCursor(await searchParams);

  // A cursor names a row, not a page, so the set behind a cursor URL changes
  // whenever an article is published above it. Self-canonical *and* indexable
  // would publish an unstable URL; `follow` still lets a crawler walk the
  // whole archive through the "older articles" link.
  if (cursor !== null) {
    return {
      title: messages.title,
      description: messages.description,
      robots: { index: false, follow: true },
      alternates: { canonical: blogIndexPath(locale, cursor) },
    };
  }

  return {
    title: messages.title,
    description: messages.description,
    alternates: {
      canonical: localePath(locale, "blog"),
      languages: {
        en: localePath("en", "blog"),
        fa: localePath("fa", "blog"),
        "x-default": localePath("en", "blog"),
      },
      types: {
        "application/rss+xml": [
          { url: feedPath(locale), title: messages.feedTitle },
        ],
      },
    },
    openGraph: {
      type: "website",
      locale,
      alternateLocale: [locale === "en" ? "fa" : "en"],
      title: messages.title,
      description: messages.description,
      url: localePath(locale, "blog"),
    },
  };
}

export default async function LocaleBlogPage({
  params,
  searchParams,
}: Readonly<{ params: RouteParams; searchParams: RouteSearch }>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const search = await searchParams;
  if (search.cursor !== undefined && readCursor(search) === null) notFound();
  const cursor = readCursor(search);
  const messages = getMessages(locale).blog;

  let reads;
  try {
    reads = await Promise.all([
      getPortfolioArticlePage(locale, cursor ?? undefined),
      getPortfolioTaxonomyIndex(locale),
      // Only the first page carries the `Blog` graph: the structured list
      // describes the blog, not the slice of it a cursor happens to name.
      cursor === null ? getPortfolioFeedEntries(locale) : Promise.resolve([]),
    ]);
  } catch (error) {
    if (!(error instanceof PublicDataUnavailableError)) throw error;
    return <UnavailableBlog locale={locale} />;
  }

  const [page, taxonomy, entries] = reads;
  const nonce = (await headers()).get("x-portfolio-csp-nonce") ?? undefined;
  const slugs = buildTaxonomySlugs(taxonomy);

  return (
    <section className="Container bg-surface/90 border-border mt-4 mb-16 space-y-8 border p-5 shadow-lg backdrop-blur-md md:my-16 md:p-8">
      <header className="space-y-3">
        <h1 className="text-4xl font-bold">{messages.title}</h1>
        <p className="text-text-muted max-w-3xl">{messages.description}</p>
      </header>

      {taxonomy.categories.length === 0 && taxonomy.tags.length === 0 ? null : (
        <nav aria-label={messages.categoryLabel} className="space-y-3">
          {(
            [
              ["category", taxonomy.categories, messages.categoryLabel],
              ["tag", taxonomy.tags, messages.tagLabel],
            ] as const
          ).map(([kind, terms, label]) =>
            terms.length === 0 ? null : (
              <div key={kind} className="flex flex-wrap items-center gap-3">
                <h2 className="text-sm font-semibold">{label}</h2>
                {terms.map((term) => (
                  <Link
                    key={term.key}
                    href={blogTaxonomyPath(locale, kind, term.slug)}
                    className="border-border border px-2 py-1 text-sm underline-offset-4 hover:underline"
                  >
                    {term.name}
                  </Link>
                ))}
              </div>
            )
          )}
        </nav>
      )}

      {page.list.posts.length === 0 ? (
        <p>{messages.empty}</p>
      ) : (
        <ArticleSummaryList
          locale={locale}
          posts={page.list.posts}
          taxonomy={slugs}
        />
      )}

      {cursor === null && page.nextCursor === null ? null : (
        <nav
          aria-label={messages.pagination}
          className="flex flex-wrap gap-6 border-t pt-6"
        >
          {cursor === null ? null : (
            <Link href={blogIndexPath(locale)} className="underline">
              {messages.newestArticles}
            </Link>
          )}
          {page.nextCursor === null ? null : (
            <Link
              href={blogIndexPath(locale, page.nextCursor)}
              rel="next"
              className="underline"
            >
              {messages.olderArticles}
            </Link>
          )}
        </nav>
      )}

      <p>
        <a href={feedPath(locale)} className="underline">
          {messages.feedLink}
        </a>
      </p>

      {entries.length === 0 ? null : (
        <script
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: buildBlogIndexJsonLd(locale, {
              title: messages.title,
              description: messages.description,
              entries,
            }),
          }}
        />
      )}
    </section>
  );
}

function UnavailableBlog({ locale }: { readonly locale: "en" | "fa" }) {
  return (
    <main
      className="Container bg-surface/90 border-border my-20 border p-8 text-center shadow-lg backdrop-blur-md"
      role="alert"
    >
      <h1 className="text-2xl font-semibold">
        {getMessages(locale).blog.unavailable}
      </h1>
    </main>
  );
}
