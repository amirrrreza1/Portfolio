import "server-only";

import type { Locale } from "@portfolio/contracts/common";

import { getLegacyPortfolioData } from "./legacy-portfolio";
import {
  createPublicProjectsClient,
  type PublicProjectsClientResult,
} from "./public-api-client";
import {
  parsePortfolioDataSource,
  selectPortfolioProjects,
  type PortfolioProjectsView,
} from "./portfolio-projects-source";

let readDatabase:
  ((locale: Locale) => Promise<PublicProjectsClientResult>) | undefined;

export async function getPortfolioProjects(
  locale: Locale
): Promise<PortfolioProjectsView> {
  const source = parsePortfolioDataSource(process.env.PORTFOLIO_DATA_SOURCE);

  return selectPortfolioProjects(source, locale, {
    readLegacy: () => {
      const legacy = getLegacyPortfolioData();
      return { projects: legacy.projects, skills: legacy.skills };
    },
    readDatabase: async (requestedLocale) => {
      readDatabase ??= createPublicProjectsClient({
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
