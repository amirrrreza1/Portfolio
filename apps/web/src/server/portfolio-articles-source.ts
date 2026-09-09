import type {
  PublicArticleDetailItem,
  PublicArticleList,
  PublicArticleAlternate,
} from "@portfolio/contracts/blog";
import type { Locale } from "@portfolio/contracts/common";

import {
  getDemoArticle,
  getDemoArticleList,
  isDemoBlogEnabled,
} from "./demo-blog";
import type { PortfolioDataSource } from "./portfolio-data-source";

export interface PortfolioArticleDetailView {
  readonly article: PublicArticleDetailItem | null;
  readonly availableTranslations: readonly PublicArticleAlternate[];
}

export async function selectPortfolioArticles(
  source: PortfolioDataSource,
  locale: Locale,
  dependencies: {
    readonly readDatabase: (locale: Locale) => Promise<PublicArticleList>;
  }
): Promise<PublicArticleList> {
  if (source === "legacy") {
    return isDemoBlogEnabled()
      ? getDemoArticleList(locale)
      : { locale, posts: [] };
  }
  return dependencies.readDatabase(locale);
}

export async function selectPortfolioArticleDetail(
  source: PortfolioDataSource,
  locale: Locale,
  slug: string,
  dependencies: {
    readonly readDatabase: (
      locale: Locale,
      slug: string
    ) => Promise<PortfolioArticleDetailView>;
  }
): Promise<PortfolioArticleDetailView> {
  if (source === "legacy") {
    if (isDemoBlogEnabled()) {
      const article = getDemoArticle(locale);
      if (article.slug === slug) {
        return {
          article,
          availableTranslations: article.alternates,
        };
      }
    }
    return { article: null, availableTranslations: [] };
  }
  return dependencies.readDatabase(locale, slug);
}
