import "server-only";

import type {
  PublicArticleTaxonomyList,
  PublicBlogTaxonomyIndex,
  PublicFeedEntry,
  PublicTaxonomyKind,
} from "@portfolio/contracts/blog";
import type { Locale } from "@portfolio/contracts/common";
import { cache } from "react";

import { parsePortfolioDataSource } from "./portfolio-data-source";
import {
  createPublicArticleTaxonomyClient,
  createPublicBlogTaxonomyIndexClient,
  createPublicFeedIndexClient,
  PublicApiResponseError,
  type PublicArticleTaxonomyClientResult,
  type PublicBlogTaxonomyIndexClientResult,
  type PublicFeedIndexClientResult,
} from "./public-api-client";

/**
 * Discovery reads for the blog's taxonomy pages, feeds, and sitemaps.
 *
 * Kept out of `portfolio-articles.ts` because these have a different failure
 * contract: a taxonomy page that does not exist is a `404` the route renders,
 * whereas a listing that cannot be read is an outage the proxy answers with a
 * `503`. Sharing one module made it too easy to handle one as the other.
 */

export interface PortfolioTaxonomyView {
  readonly page: PublicArticleTaxonomyList | null;
  readonly nextCursor: string | null;
}

/**
 * How many feed-index pages a single generation is allowed to walk.
 *
 * The endpoint is cursor-paginated and the sitemap wants everything, so
 * without a ceiling one slow page would become an unbounded fan-out on a
 * public route. Ten pages of the API's maximum size is 1,000 entries, which is
 * far beyond this blog and still a bound.
 */
const MAX_FEED_PAGES = 10;
const FEED_PAGE_SIZE = 100;

let readTaxonomy:
  | ((
      locale: Locale,
      kind: PublicTaxonomyKind,
      slug: string,
      query?: { readonly limit?: number; readonly cursor?: string }
    ) => Promise<PublicArticleTaxonomyClientResult>)
  | undefined;

let readTaxonomyIndex:
  | ((locale: Locale) => Promise<PublicBlogTaxonomyIndexClientResult>)
  | undefined;

let readFeed:
  | ((
      locale: Locale,
      query?: { readonly limit?: number; readonly cursor?: string }
    ) => Promise<PublicFeedIndexClientResult>)
  | undefined;

const readPortfolioTaxonomyPage = async (
  locale: Locale,
  kind: PublicTaxonomyKind,
  slug: string,
  cursor?: string
): Promise<PortfolioTaxonomyView> => {
  if (
    parsePortfolioDataSource(process.env.PORTFOLIO_DATA_SOURCE) === "legacy"
  ) {
    return { page: null, nextCursor: null };
  }
  readTaxonomy ??= createPublicArticleTaxonomyClient({
    apiOrigin: requiredApiOrigin(),
    onStale: ({ key, ageMs }) => {
      console.warn("Serving last-known-good public data", { key, ageMs });
    },
  });
  try {
    const result = await readTaxonomy(locale, kind, slug, {
      limit: 20,
      ...(cursor === undefined ? {} : { cursor }),
    });
    return {
      page: result.envelope.data,
      nextCursor: result.envelope.meta.nextCursor,
    };
  } catch (error) {
    // A withdrawn or unknown term is a canonical 404 for the route to render,
    // not a dependency outage: the API answered, and its answer was "no".
    if (error instanceof PublicApiResponseError && error.status === 404) {
      return { page: null, nextCursor: null };
    }
    throw error;
  }
};

/** Deduplicates metadata and page reads within one React server render. */
export const getPortfolioTaxonomyPage = cache(readPortfolioTaxonomyPage);

/**
 * Every published entry in a locale, in publication order.
 *
 * Walked to exhaustion rather than truncated at one page, because a sitemap
 * that silently stops at the twentieth article is worse than no sitemap: it
 * tells a crawler the rest of the blog does not exist.
 */
export async function getPortfolioFeedEntries(
  locale: Locale
): Promise<readonly PublicFeedEntry[]> {
  if (
    parsePortfolioDataSource(process.env.PORTFOLIO_DATA_SOURCE) === "legacy"
  ) {
    return [];
  }
  readFeed ??= createPublicFeedIndexClient({
    apiOrigin: requiredApiOrigin(),
    onStale: ({ key, ageMs }) => {
      console.warn("Serving last-known-good public data", { key, ageMs });
    },
  });

  const entries: PublicFeedEntry[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_FEED_PAGES; page += 1) {
    const result = await readFeed(locale, {
      limit: FEED_PAGE_SIZE,
      ...(cursor === undefined ? {} : { cursor }),
    });
    entries.push(...result.envelope.data.entries);
    const next = result.envelope.meta.nextCursor;
    if (next === null) return entries;
    cursor = next;
  }
  console.warn(
    `The ${locale} feed index has more pages than one generation walks; the tail is omitted.`
  );
  return entries;
}

/**
 * The navigation index of categories and tags.
 *
 * Cached per render because three surfaces want it at once — the page body,
 * its structured data, and the article cards that link each term — and they
 * are rendered from the same request.
 */
const readPortfolioTaxonomyIndex = async (
  locale: Locale
): Promise<PublicBlogTaxonomyIndex> => {
  if (
    parsePortfolioDataSource(process.env.PORTFOLIO_DATA_SOURCE) === "legacy"
  ) {
    return { locale, categories: [], tags: [] };
  }
  readTaxonomyIndex ??= createPublicBlogTaxonomyIndexClient({
    apiOrigin: requiredApiOrigin(),
    onStale: ({ key, ageMs }) => {
      console.warn("Serving last-known-good public data", { key, ageMs });
    },
  });
  return (await readTaxonomyIndex(locale)).envelope.data;
};

export const getPortfolioTaxonomyIndex = cache(readPortfolioTaxonomyIndex);

function requiredApiOrigin(): string {
  const origin = process.env.API_INTERNAL_ORIGIN?.trim();
  if (!origin) throw new Error("API_INTERNAL_ORIGIN is required.");
  return origin;
}
