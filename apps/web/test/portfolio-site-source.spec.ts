import { publicSiteSchema } from "@portfolio/contracts/portfolio";
import { describe, expect, it, vi } from "vitest";

import { selectPortfolioSite } from "../src/server/portfolio-site-source";

function site(siteName: string) {
  return publicSiteSchema.parse({
    locale: "en",
    settings: {
      canonicalSiteUrl: "http://localhost:3000",
      defaultLocale: "en",
      enabledLocales: ["en", "fa"],
      siteName,
      titleTemplate: `%s | ${siteName}`,
      metaDescription: `${siteName} portfolio`,
      authorName: "Amirreza Azarioun",
      creatorName: "Amirreza Azarioun",
      publisherName: "Amirreza Azarioun",
      contactEnabled: true,
      githubUsername: "amirrrreza1",
      githubRepoAllowlist: ["Portfolio", "Morse-Code"],
      githubCacheTtlSeconds: 3_600,
      robotsAllowIndexing: false,
    },
    sections: [],
    navigation: [],
    socialLinks: [],
  });
}

describe("portfolio site source switch", () => {
  it("uses only the database reader when selected", async () => {
    const database = site("Database Site");
    const readDatabase = vi.fn().mockResolvedValue(database);
    const readLegacy = vi.fn(() => site("Legacy Site"));

    await expect(
      selectPortfolioSite("database", "en", { readDatabase, readLegacy })
    ).resolves.toBe(database);
    expect(readDatabase).toHaveBeenCalledWith("en");
    expect(readLegacy).not.toHaveBeenCalled();
  });

  it("uses only the legacy reader when rollback is selected", async () => {
    const legacy = site("Legacy Site");
    const readDatabase = vi.fn().mockResolvedValue(site("Database Site"));
    const readLegacy = vi.fn(() => legacy);

    await expect(
      selectPortfolioSite("legacy", "en", { readDatabase, readLegacy })
    ).resolves.toBe(legacy);
    expect(readLegacy).toHaveBeenCalledWith("en");
    expect(readDatabase).not.toHaveBeenCalled();
  });
});
