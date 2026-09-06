import "server-only";

import type { Locale } from "@portfolio/contracts/common";
import { connection } from "next/server";
import { cache } from "react";

import { parsePortfolioDataSource } from "./portfolio-data-source";
import { getLegacySiteData } from "./legacy-portfolio";
import {
  createPublicSiteClient,
  type PublicSiteClientResult,
} from "./public-api-client";
import {
  selectPortfolioSite,
  type PortfolioSiteView,
} from "./portfolio-site-source";

let readDatabase:
  ((locale: Locale) => Promise<PublicSiteClientResult>) | undefined;

const readPortfolioSite = async (
  locale: Locale
): Promise<PortfolioSiteView> => {
  const source = parsePortfolioDataSource(process.env.PORTFOLIO_DATA_SOURCE);
  if (source === "legacy") {
    // The rollback adapter derives the displayed age from the current date.
    // Make that explicitly request-time work under Cache Components so Next's
    // prerender analysis never treats a changing clock value as static output.
    await connection();
  }

  return selectPortfolioSite(source, locale, {
    readLegacy: getLegacySiteData,
    readDatabase: async (requestedLocale) => {
      readDatabase ??= createPublicSiteClient({
        apiOrigin: requiredApiOrigin(),
        onStale: ({ key, ageMs }) => {
          console.warn("Serving last-known-good public data", { key, ageMs });
        },
      });
      return (await readDatabase(requestedLocale)).envelope.data;
    },
  });
};

/** Deduplicates the layout and page reads within one React server render. */
export const getPortfolioSite = cache(readPortfolioSite);

function requiredApiOrigin(): string {
  const origin = process.env.API_INTERNAL_ORIGIN?.trim();
  if (!origin) throw new Error("API_INTERNAL_ORIGIN is required.");
  return origin;
}
