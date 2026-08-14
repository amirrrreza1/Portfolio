import type { Locale } from "@portfolio/contracts/common";
import type { PublicSite } from "@portfolio/contracts/portfolio";

import type { PortfolioDataSource } from "./portfolio-data-source";

export type PortfolioSiteView = PublicSite;

export interface PortfolioSiteSourceDependencies {
  readonly readDatabase: (locale: Locale) => Promise<PublicSite>;
  readonly readLegacy: (locale: Locale) => PublicSite;
}

export async function selectPortfolioSite(
  source: PortfolioDataSource,
  locale: Locale,
  dependencies: PortfolioSiteSourceDependencies
): Promise<PortfolioSiteView> {
  if (source === "legacy") return dependencies.readLegacy(locale);
  return dependencies.readDatabase(locale);
}
