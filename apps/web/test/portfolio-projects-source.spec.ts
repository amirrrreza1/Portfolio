import { publicProjectsSchema } from "@portfolio/contracts/portfolio";
import { describe, expect, it, vi } from "vitest";

import {
  parsePortfolioDataSource,
  selectPortfolioProjects,
} from "../src/server/portfolio-projects-source";

const databaseData = publicProjectsSchema.parse({
  locale: "en",
  skillCategories: [
    {
      id: "c12345678901234567890123",
      key: "frameworks",
      name: "Frameworks",
      skills: [
        {
          id: "s12345678901234567890123",
          name: "Next.js",
          color: "#38bdf8",
        },
      ],
    },
  ],
  projects: [
    {
      id: "p12345678901234567890123",
      slug: "portfolio",
      title: "Portfolio",
      summary: "A migrated project.",
      status: "COMPLETED",
      demoUrl: null,
      repositoryUrl: "https://github.com/example/portfolio",
      featured: false,
      skillIds: ["s12345678901234567890123"],
      image: null,
    },
  ],
});

const legacyData = {
  projects: [
    {
      id: 1,
      slug: "legacy",
      title: "Legacy",
      description: "Legacy project.",
      link: null,
      repo: null,
      image: null,
      technologies: [202],
      status: "completed" as const,
    },
  ],
  skills: [
    {
      id: 2,
      category: "Frameworks",
      items: [{ id: 202, name: "Next.js", color: "#000000" }],
    },
  ],
};

describe("portfolio project source switch", () => {
  it("uses only the database reader when the target flag is active", async () => {
    const readDatabase = vi.fn().mockResolvedValue(databaseData);
    const readLegacy = vi.fn(() => legacyData);

    await expect(
      selectPortfolioProjects("database", "en", {
        readDatabase,
        readLegacy,
      })
    ).resolves.toMatchObject({
      projects: [
        {
          id: "p12345678901234567890123",
          slug: "portfolio",
          description: "A migrated project.",
          technologies: ["s12345678901234567890123"],
        },
      ],
    });
    expect(readDatabase).toHaveBeenCalledWith("en");
    expect(readLegacy).not.toHaveBeenCalled();
  });

  it("reaches only the dormant adapter when rollback is explicit", async () => {
    const readDatabase = vi.fn().mockResolvedValue(databaseData);
    const readLegacy = vi.fn(() => legacyData);

    await expect(
      selectPortfolioProjects("legacy", "en", {
        readDatabase,
        readLegacy,
      })
    ).resolves.toBe(legacyData);
    expect(readLegacy).toHaveBeenCalledOnce();
    expect(readDatabase).not.toHaveBeenCalled();
  });

  it("defaults safely to legacy until deployment explicitly selects database", () => {
    expect(parsePortfolioDataSource(undefined)).toBe("legacy");
    expect(parsePortfolioDataSource("database")).toBe("database");
    expect(() => parsePortfolioDataSource("auto")).toThrow(
      "PORTFOLIO_DATA_SOURCE"
    );
  });
});
