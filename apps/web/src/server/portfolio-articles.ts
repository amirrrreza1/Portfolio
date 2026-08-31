import "server-only";

import type { PublicArticleList } from "@portfolio/contracts/blog";
import type { Locale } from "@portfolio/contracts/common";

import { parsePortfolioDataSource } from "./portfolio-data-source";
import {
  createPublicArticleListClient,
  type PublicArticleListClientResult,
} from "./public-api-client";
import { selectPortfolioArticles } from "./portfolio-articles-source";

const PAGE_SIZE = 20;

export interface PortfolioArticlePage {
  readonly list: PublicArticleList;
  readonly nextCursor: string | null;
}

let readDatabase:
  | ((
      locale: Locale,
      query?: { readonly limit?: number; readonly cursor?: string }
    ) => Promise<PublicArticleListClientResult>)
  | undefined;

/**
 * One page of the blog index.
 *
 * The cursor is threaded through rather than resolved here so the route can
 * decide what an invalid one means. A cursor is opaque and can be edited by
 * hand in the address bar, and the API answers a malformed one with a
 * validation error rather than a silent restart at page one — which is the
 * behaviour a reader wants, but only if the route turns it into a `404`
 * instead of an outage.
 */
export async function getPortfolioArticlePage(
  locale: Locale,
  cursor?: string
): Promise<PortfolioArticlePage> {
  const source = parsePortfolioDataSource(process.env.PORTFOLIO_DATA_SOURCE);
  let nextCursor: string | null = null;
  const list = await selectPortfolioArticles(source, locale, {
    readDatabase: async (requestedLocale) => {
      readDatabase ??= createPublicArticleListClient({
        apiOrigin: requiredApiOrigin(),
        onStale: ({ key, ageMs }) => {
          console.warn("Serving last-known-good public data", { key, ageMs });
        },
      });
      const result = await readDatabase(requestedLocale, {
        limit: PAGE_SIZE,
        ...(cursor === undefined ? {} : { cursor }),
      });
      nextCursor = result.envelope.meta.nextCursor;
      return result.envelope.data;
    },
  });
  return { list, nextCursor };
}

export async function getPortfolioArticles(
  locale: Locale
): Promise<PublicArticleList> {
  return (await getPortfolioArticlePage(locale)).list;
}

function requiredApiOrigin(): string {
  const origin = process.env.API_INTERNAL_ORIGIN?.trim();
  if (!origin) throw new Error("API_INTERNAL_ORIGIN is required.");
  return origin;
}
