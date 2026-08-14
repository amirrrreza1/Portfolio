import "server-only";

import type { Locale } from "@portfolio/contracts/common";
import { cache } from "react";

import { parsePortfolioDataSource } from "./portfolio-data-source";
import {
  createPublicArticleDetailClient,
  PublicArticleTranslationNotFoundError,
  type PublicArticleDetailClientResult,
} from "./public-api-client";
import {
  selectPortfolioArticleDetail,
  type PortfolioArticleDetailView,
} from "./portfolio-articles-source";

let readDatabase:
  | ((locale: Locale, slug: string) => Promise<PublicArticleDetailClientResult>)
  | undefined;

const readPortfolioArticleDetail = async (
  locale: Locale,
  slug: string
): Promise<PortfolioArticleDetailView> => {
  const source = parsePortfolioDataSource(process.env.PORTFOLIO_DATA_SOURCE);
  return selectPortfolioArticleDetail(source, locale, slug, {
    readDatabase: async (requestedLocale, requestedSlug) => {
      readDatabase ??= createPublicArticleDetailClient({
        apiOrigin: requiredApiOrigin(),
        onStale: ({ key, ageMs }) => {
          console.warn("Serving last-known-good public data", { key, ageMs });
        },
      });
      try {
        const result = await readDatabase(requestedLocale, requestedSlug);
        return {
          article: result.envelope.data.post,
          availableTranslations: result.envelope.data.post.alternates,
        };
      } catch (error) {
        if (error instanceof PublicArticleTranslationNotFoundError) {
          return {
            article: null,
            availableTranslations: error.availableTranslations,
          };
        }
        throw error;
      }
    },
  });
};

/** Deduplicates metadata and page reads within one React server render. */
export const getPortfolioArticleDetail = cache(readPortfolioArticleDetail);

function requiredApiOrigin(): string {
  const origin = process.env.API_INTERNAL_ORIGIN?.trim();
  if (!origin) throw new Error("API_INTERNAL_ORIGIN is required.");
  return origin;
}
