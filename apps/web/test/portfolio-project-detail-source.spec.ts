import { publicProjectDetailSchema } from "@portfolio/contracts/portfolio";
import { describe, expect, it, vi } from "vitest";

import { selectPortfolioProjectDetail } from "../src/server/portfolio-project-detail-source";

const detail = publicProjectDetailSchema.parse({
  locale: "en",
  project: {
    id: "p12345678901234567890123",
    slug: "portfolio",
    title: "Portfolio",
    summary: "Database detail.",
    status: "COMPLETED",
    demoUrl: null,
    repositoryUrl: null,
    featured: false,
    skillIds: [],
    image: null,
    longDescription: null,
    startedAt: null,
    completedAt: null,
    skills: [],
  },
});

describe("portfolio project detail source switch", () => {
  it("uses only the database source when selected", async () => {
    const readDatabase = vi.fn().mockResolvedValue(detail);
    const readLegacy = vi.fn().mockReturnValue(null);
    await expect(
      selectPortfolioProjectDetail("database", "en", "portfolio", {
        readDatabase,
        readLegacy,
      })
    ).resolves.toEqual(detail.project);
    expect(readDatabase).toHaveBeenCalledWith("en", "portfolio");
    expect(readLegacy).not.toHaveBeenCalled();
  });

  it("uses only the API-independent legacy source when selected", async () => {
    const readDatabase = vi.fn().mockResolvedValue(detail);
    const readLegacy = vi.fn().mockReturnValue(detail.project);
    await expect(
      selectPortfolioProjectDetail("legacy", "fa", "portfolio", {
        readDatabase,
        readLegacy,
      })
    ).resolves.toEqual(detail.project);
    expect(readLegacy).toHaveBeenCalledWith("portfolio");
    expect(readDatabase).not.toHaveBeenCalled();
  });
});
