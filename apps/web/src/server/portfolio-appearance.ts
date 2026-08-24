import "server-only";

import type { PublicAppearance } from "@portfolio/contracts/appearance";
import type { Locale } from "@portfolio/contracts/common";
import { cache } from "react";

import { getLegacyAppearanceData } from "./legacy-portfolio";
import {
  createPublicAppearanceClient,
  type PublicAppearanceClientResult,
} from "./public-api-client";
import { selectPortfolioAppearance } from "./portfolio-appearance-source";
import { parsePortfolioDataSource } from "./portfolio-data-source";

let readDatabase:
  ((locale: Locale) => Promise<PublicAppearanceClientResult>) | undefined;

const readPortfolioAppearance = async (
  locale: Locale
): Promise<PublicAppearance> => {
  const source = parsePortfolioDataSource(process.env.PORTFOLIO_DATA_SOURCE);

  return selectPortfolioAppearance(source, locale, {
    readLegacy: getLegacyAppearanceData,
    readDatabase: async (requestedLocale) => {
      readDatabase ??= createPublicAppearanceClient({
        apiOrigin: requiredApiOrigin(),
        onStale: ({ key, ageMs }) => {
          console.warn("Serving last-known-good public data", { key, ageMs });
        },
      });
      return (await readDatabase(requestedLocale)).envelope.data;
    },
  });
};

/**
 * The root shell and a blog article both need the same locale-scoped public
 * allowlist. Deduplicate that read during an RSC render so adding the article
 * attributes does not add a second API dependency or cache entry.
 */
export const getPortfolioAppearance = cache(readPortfolioAppearance);

function requiredApiOrigin(): string {
  const origin = process.env.API_INTERNAL_ORIGIN?.trim();
  if (!origin) throw new Error("API_INTERNAL_ORIGIN is required.");
  return origin;
}
