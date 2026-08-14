import { describe, expect, it, vi } from "vitest";

import {
  selectPortfolioArticleDetail,
  selectPortfolioArticles,
} from "../src/server/portfolio-articles-source";

describe("portfolio article source switch", () => {
  it("uses database articles without portfolio-style locale fallback", async () => {
    const data = { locale: "fa" as const, posts: [] };
    const readDatabase = vi.fn().mockResolvedValue(data);
    await expect(
      selectPortfolioArticles("database", "fa", { readDatabase })
    ).resolves.toBe(data);
    expect(readDatabase).toHaveBeenCalledWith("fa");
  });

  it("keeps explicit legacy rollback API-independent and honestly empty", async () => {
    const readDatabase = vi.fn();
    await expect(
      selectPortfolioArticles("legacy", "en", { readDatabase })
    ).resolves.toEqual({ locale: "en", posts: [] });
    await expect(
      selectPortfolioArticleDetail("legacy", "en", "missing", {
        readDatabase,
      })
    ).resolves.toEqual({ article: null, availableTranslations: [] });
    expect(readDatabase).not.toHaveBeenCalled();
  });

  it("preserves the database no-translation result without substituting another body", async () => {
    const missing = {
      article: null,
      availableTranslations: [
        { locale: "en" as const, slug: "typed-public-reads" },
      ],
    };
    const readDatabase = vi.fn().mockResolvedValue(missing);
    await expect(
      selectPortfolioArticleDetail("database", "fa", "مقاله-ناقص", {
        readDatabase,
      })
    ).resolves.toBe(missing);
  });
});
