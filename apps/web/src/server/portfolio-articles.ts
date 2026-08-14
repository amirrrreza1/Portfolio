import "server-only";

import type { Locale } from "@portfolio/contracts/common";

import { parsePortfolioDataSource } from "./portfolio-data-source";
import {
  createPublicArticleListClient,
  type PublicArticleListClientResult,
} from "./public-api-client";
import { selectPortfolioArticles } from "./portfolio-articles-source";

let readDatabase:
  | ((
      locale: Locale,
      query?: { readonly limit?: number }
    ) => Promise<PublicArticleListClientResult>)
  | undefined;

export async function getPortfolioArticles(locale: Locale) {
  const source = parsePortfolioDataSource(process.env.PORTFOLIO_DATA_SOURCE);
  return selectPortfolioArticles(source, locale, {
    readDatabase: async (requestedLocale) => {
      readDatabase ??= createPublicArticleListClient({
        apiOrigin: requiredApiOrigin(),
        onStale: ({ key, ageMs }) => {
          console.warn("Serving last-known-good public data", { key, ageMs });
        },
      });
      return (await readDatabase(requestedLocale, { limit: 20 })).envelope.data;
    },
  });
}

function requiredApiOrigin(): string {
  const origin = process.env.API_INTERNAL_ORIGIN?.trim();
  if (!origin) throw new Error("API_INTERNAL_ORIGIN is required.");
  return origin;
}
