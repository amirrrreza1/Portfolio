import "server-only";

import type { Locale } from "@portfolio/contracts/common";
import type { PublicProjectDetailItem } from "@portfolio/contracts/portfolio";
import { cache } from "react";

import { getLegacyProjectDetail } from "./legacy-portfolio";
import { parsePortfolioDataSource } from "./portfolio-data-source";
import { selectPortfolioProjectDetail } from "./portfolio-project-detail-source";
import {
  createPublicProjectDetailClient,
  type PublicProjectDetailClientResult,
} from "./public-api-client";

let readDatabase:
  | ((locale: Locale, slug: string) => Promise<PublicProjectDetailClientResult>)
  | undefined;

const readPortfolioProjectDetail = async (
  locale: Locale,
  slug: string
): Promise<PublicProjectDetailItem | null> => {
  const source = parsePortfolioDataSource(process.env.PORTFOLIO_DATA_SOURCE);
  return selectPortfolioProjectDetail(source, locale, slug, {
    readLegacy: getLegacyProjectDetail,
    readDatabase: async (requestedLocale, requestedSlug) => {
      readDatabase ??= createPublicProjectDetailClient({
        apiOrigin: requiredApiOrigin(),
        onStale: ({ key, ageMs }) => {
          console.warn("Serving last-known-good public data", { key, ageMs });
        },
      });
      return (await readDatabase(requestedLocale, requestedSlug)).envelope.data;
    },
  });
};

/** Deduplicates metadata and page reads within one React server render. */
export const getPortfolioProjectDetail = cache(readPortfolioProjectDetail);

function requiredApiOrigin(): string {
  const origin = process.env.API_INTERNAL_ORIGIN?.trim();
  if (!origin) throw new Error("API_INTERNAL_ORIGIN is required.");
  return origin;
}
