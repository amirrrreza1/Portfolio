import type { Locale } from "@portfolio/contracts/common";
import type {
  PublicProjectDetail,
  PublicProjectDetailItem,
} from "@portfolio/contracts/portfolio";

import type { PortfolioDataSource } from "./portfolio-data-source";

export interface PortfolioProjectDetailSourceDependencies {
  readonly readDatabase: (
    locale: Locale,
    slug: string
  ) => Promise<PublicProjectDetail>;
  readonly readLegacy: (slug: string) => PublicProjectDetailItem | null;
}

export async function selectPortfolioProjectDetail(
  source: PortfolioDataSource,
  locale: Locale,
  slug: string,
  dependencies: PortfolioProjectDetailSourceDependencies
): Promise<PublicProjectDetailItem | null> {
  if (source === "legacy") return dependencies.readLegacy(slug);
  return (await dependencies.readDatabase(locale, slug)).project;
}
