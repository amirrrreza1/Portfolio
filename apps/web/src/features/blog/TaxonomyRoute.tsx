import {
  ArticleSummaryList,
  buildTaxonomySlugs,
} from "@/features/blog/ArticleSummaryList";
import { getMessages } from "@/i18n/messages";
import { blogTaxonomyPath, decodeSlugParam, localePath } from "@/i18n/routing";
import {
  getPortfolioTaxonomyIndex,
  getPortfolioTaxonomyPage,
} from "@/server/portfolio-blog-discovery";
import { PublicDataUnavailableError } from "@/server/public-api-client";
import {
  buildBreadcrumbJsonLd,
  buildTaxonomyJsonLd,
} from "@/server/public-blog-seo";
import type { PublicTaxonomyKind } from "@portfolio/contracts/blog";
import {
  cursorSchema,
  isLocale,
  slugSchemaFor,
  type Locale,
} from "@portfolio/contracts/common";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

/**
 * The category and tag routes, which differ only in which term they address.
 *
 * One implementation rather than two near-identical page files: these pages
 * carry canonical URLs, `hreflang`, structured data, pagination and a `404`
 * rule, and every one of those is a place where two copies would drift. The
 * route files stay thin enough to be obviously equivalent.
 */

export type TaxonomyRouteParams = Promise<{ locale: string; slug: string }>;
export type TaxonomyRouteSearch = Promise<
  Record<string, string | string[] | undefined>
>;

interface ResolvedRoute {
  readonly locale: Locale;
  readonly slug: string;
  readonly cursor: string | null;
}

function resolve(
  locale: string,
  slugInput: string,
  search: Record<string, string | string[] | undefined>
): ResolvedRoute | null {
  if (!isLocale(locale)) return null;
  const decoded = decodeSlugParam(slugInput);
  if (decoded === null) return null;
  const slug = slugSchemaFor(locale).safeParse(decoded);
  if (!slug.success) return null;
  const raw = search.cursor;
  if (raw === undefined) return { locale, slug: slug.data, cursor: null };
  const cursor = cursorSchema.safeParse(Array.isArray(raw) ? undefined : raw);
  if (!cursor.success) return null;
  return { locale, slug: slug.data, cursor: cursor.data };
}

export async function buildTaxonomyMetadata(
  kind: PublicTaxonomyKind,
  params: TaxonomyRouteParams,
  searchParams: TaxonomyRouteSearch
): Promise<Metadata> {
  const { locale, slug } = await params;
  const route = resolve(locale, slug, await searchParams);
  if (route === null) return {};

  try {
    const { page } = await getPortfolioTaxonomyPage(
      route.locale,
      kind,
      route.slug,
      route.cursor ?? undefined
    );
    // Resolve the canonical 404 in metadata generation as well as in the
    // streamed page body. Cache Components can otherwise flush a partial 200
    // shell before a nested `notFound()` is raised, which turns an unknown
    // taxonomy term into a misleading successful response.
    if (page === null) notFound();

    const messages = getMessages(route.locale).blog;
    const heading =
      kind === "category" ? messages.categoryHeading : messages.tagHeading;
    const title = `${heading} ${page.taxonomy.name}`;
    const description = page.taxonomy.description ?? messages.description;
    const canonical = blogTaxonomyPath(route.locale, kind, page.taxonomy.slug);

    // As on the index: a cursor names a row, so a cursor URL is not a stable
    // resource and is kept out of the index while staying followable.
    if (route.cursor !== null) {
      return {
        title,
        description,
        robots: { index: false, follow: true },
        alternates: {
          canonical: `${canonical}?cursor=${encodeURIComponent(route.cursor)}`,
        },
      };
    }

    const languages = Object.fromEntries(
      page.taxonomy.alternates.map((alternate) => [
        alternate.locale,
        blogTaxonomyPath(alternate.locale, kind, alternate.slug),
      ])
    );
    const english = page.taxonomy.alternates.find(
      ({ locale: alternateLocale }) => alternateLocale === "en"
    );
    if (english) {
      languages["x-default"] = blogTaxonomyPath("en", kind, english.slug);
    }

    return {
      title,
      description,
      alternates: { canonical, languages },
      openGraph: {
        type: "website",
        locale: route.locale,
        alternateLocale: page.taxonomy.alternates
          .filter(
            ({ locale: alternateLocale }) => alternateLocale !== route.locale
          )
          .map(({ locale: alternateLocale }) => alternateLocale),
        title,
        description,
        url: canonical,
      },
    };
  } catch (error) {
    if (error instanceof PublicDataUnavailableError) {
      return { robots: { index: false, follow: false } };
    }
    throw error;
  }
}

/**
 * Resolve the taxonomy before the route starts streaming. This keeps an
 * unknown term a real HTTP 404 under Cache Components instead of allowing the
 * shared public shell to flush as a 200 before the nested body is evaluated.
 */
export async function assertTaxonomyExists(
  kind: PublicTaxonomyKind,
  params: TaxonomyRouteParams,
  searchParams: TaxonomyRouteSearch
): Promise<void> {
  const { locale, slug } = await params;
  const route = resolve(locale, slug, await searchParams);
  if (route === null) notFound();
  const { page } = await getPortfolioTaxonomyPage(
    route.locale,
    kind,
    route.slug,
    route.cursor ?? undefined
  );
  if (page === null) notFound();
}

export async function TaxonomyRoute({
  kind,
  params,
  searchParams,
}: Readonly<{
  kind: PublicTaxonomyKind;
  params: TaxonomyRouteParams;
  searchParams: TaxonomyRouteSearch;
}>) {
  const { locale, slug } = await params;
  const route = resolve(locale, slug, await searchParams);
  if (route === null) notFound();
  const messages = getMessages(route.locale).blog;

  let reads;
  try {
    reads = await Promise.all([
      getPortfolioTaxonomyPage(
        route.locale,
        kind,
        route.slug,
        route.cursor ?? undefined
      ),
      getPortfolioTaxonomyIndex(route.locale),
    ]);
  } catch (error) {
    if (!(error instanceof PublicDataUnavailableError)) throw error;
    return (
      <main className="Container my-20 border p-8 text-center" role="alert">
        <h1 className="text-2xl font-semibold">{messages.unavailable}</h1>
      </main>
    );
  }
  const [{ page, nextCursor }, taxonomy] = reads;
  if (page === null) notFound();

  const nonce = (await headers()).get("x-portfolio-csp-nonce") ?? undefined;
  const heading =
    kind === "category" ? messages.categoryHeading : messages.tagHeading;
  const canonical = blogTaxonomyPath(route.locale, kind, page.taxonomy.slug);
  const otherLocales = page.taxonomy.alternates.filter(
    ({ locale: alternateLocale }) => alternateLocale !== route.locale
  );

  return (
    <section className="Container my-16 space-y-8 border p-5 md:p-8">
      <nav aria-label={messages.breadcrumb} className="text-sm">
        <ol className="flex flex-wrap gap-2">
          <li>
            <Link href={localePath(route.locale)} className="underline">
              {messages.home}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href={localePath(route.locale, "blog")} className="underline">
              {messages.title}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page">{page.taxonomy.name}</li>
        </ol>
      </nav>

      <header className="space-y-3">
        <h1 className="text-4xl font-bold">
          {heading} {page.taxonomy.name}
        </h1>
        {page.taxonomy.description === null ? null : (
          <p className="text-text-muted max-w-3xl">
            {page.taxonomy.description}
          </p>
        )}
      </header>

      {otherLocales.length === 0 ? null : (
        <nav aria-label={messages.availableIn} className="flex flex-wrap gap-3">
          <span>{messages.availableIn}:</span>
          {otherLocales.map((alternate) => (
            <Link
              key={alternate.locale}
              href={blogTaxonomyPath(alternate.locale, kind, alternate.slug)}
              hrefLang={alternate.locale}
              lang={alternate.locale}
              className="underline"
            >
              {alternate.locale}
            </Link>
          ))}
        </nav>
      )}

      {page.posts.length === 0 ? (
        <p>{messages.emptyTaxonomy}</p>
      ) : (
        <ArticleSummaryList
          locale={route.locale}
          posts={page.posts}
          taxonomy={buildTaxonomySlugs(taxonomy)}
        />
      )}

      {route.cursor === null && nextCursor === null ? null : (
        <nav
          aria-label={messages.pagination}
          className="flex flex-wrap gap-6 border-t pt-6"
        >
          {route.cursor === null ? null : (
            <Link href={canonical} className="underline">
              {messages.newestArticles}
            </Link>
          )}
          {nextCursor === null ? null : (
            <Link
              href={`${canonical}?cursor=${encodeURIComponent(nextCursor)}`}
              rel="next"
              className="underline"
            >
              {messages.olderArticles}
            </Link>
          )}
        </nav>
      )}

      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{
          __html: buildTaxonomyJsonLd(route.locale, page.taxonomy, page.posts),
        }}
      />
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{
          __html: buildBreadcrumbJsonLd([
            { name: messages.home, path: localePath(route.locale) },
            { name: messages.title, path: localePath(route.locale, "blog") },
            { name: page.taxonomy.name, path: canonical },
          ]),
        }}
      />
    </section>
  );
}
