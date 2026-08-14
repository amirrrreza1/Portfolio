import type { Locale } from "@portfolio/contracts/common";
import type { PublicHome } from "@portfolio/contracts/portfolio";

import {
  parsePortfolioDataSource,
  type PortfolioDataSource,
} from "./portfolio-data-source";

export { parsePortfolioDataSource, type PortfolioDataSource };

export interface PortfolioHomeSourceDependencies {
  readonly readDatabase: (locale: Locale) => Promise<PublicHome>;
  readonly readLegacy: (locale: Locale) => PublicHome;
}

export async function selectPortfolioHome(
  source: PortfolioDataSource,
  locale: Locale,
  dependencies: PortfolioHomeSourceDependencies
): Promise<PublicHome> {
  if (source === "legacy") return dependencies.readLegacy(locale);
  return dependencies.readDatabase(locale);
}
