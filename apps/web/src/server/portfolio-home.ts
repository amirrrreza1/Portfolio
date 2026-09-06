import "server-only";

import type { Locale } from "@portfolio/contracts/common";
import { connection } from "next/server";

import { getLegacyHomeData } from "./legacy-portfolio";
import {
  createPublicHomeClient,
  type PublicHomeClientResult,
} from "./public-api-client";
import {
  parsePortfolioDataSource,
  selectPortfolioHome,
} from "./portfolio-home-source";

let readDatabase:
  ((locale: Locale) => Promise<PublicHomeClientResult>) | undefined;

export async function getPortfolioHome(locale: Locale) {
  const source = parsePortfolioDataSource(process.env.PORTFOLIO_DATA_SOURCE);
  if (source === "legacy") {
    // Legacy home content computes the owner's displayed age from the current
    // date, so it must run after Next has committed to request-time rendering.
    await connection();
  }
  return selectPortfolioHome(source, locale, {
    readLegacy: getLegacyHomeData,
    readDatabase: async (requestedLocale) => {
      readDatabase ??= createPublicHomeClient({
        apiOrigin: requiredApiOrigin(),
        onStale: ({ key, ageMs }) => {
          console.warn("Serving last-known-good public data", { key, ageMs });
        },
      });
      return (await readDatabase(requestedLocale)).envelope.data;
    },
  });
}

function requiredApiOrigin(): string {
  const origin = process.env.API_INTERNAL_ORIGIN?.trim();
  if (!origin) throw new Error("API_INTERNAL_ORIGIN is required.");
  return origin;
}
