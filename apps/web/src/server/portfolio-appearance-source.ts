import type { PublicAppearance } from "@portfolio/contracts/appearance";
import type { Locale } from "@portfolio/contracts/common";

import type { PortfolioDataSource } from "./portfolio-data-source";

export interface PortfolioAppearanceSourceDependencies {
  readonly readDatabase: (locale: Locale) => Promise<PublicAppearance>;
  readonly readLegacy: (locale: Locale) => PublicAppearance;
}

export async function selectPortfolioAppearance(
  source: PortfolioDataSource,
  locale: Locale,
  dependencies: PortfolioAppearanceSourceDependencies
): Promise<PublicAppearance> {
  if (source === "legacy") return dependencies.readLegacy(locale);
  return dependencies.readDatabase(locale);
}
