import { publicHomeSchema } from "@portfolio/contracts/portfolio";
import { describe, expect, it, vi } from "vitest";

import { selectPortfolioHome } from "../src/server/portfolio-home-source";

function home(label: string) {
  return publicHomeSchema.parse({
    locale: "en",
    quote: null,
    certificates: [],
    resume: {
      label,
      filename: "resume.pdf",
      downloadPath: "/resume.pdf",
    },
  });
}

describe("portfolio homepage source switch", () => {
  it("uses only the database reader when selected", async () => {
    const database = home("Database resume");
    const readDatabase = vi.fn().mockResolvedValue(database);
    const readLegacy = vi.fn(() => home("Legacy resume"));

    await expect(
      selectPortfolioHome("database", "en", { readDatabase, readLegacy })
    ).resolves.toBe(database);
    expect(readDatabase).toHaveBeenCalledWith("en");
    expect(readLegacy).not.toHaveBeenCalled();
  });

  it("uses only the legacy reader when rollback is selected", async () => {
    const legacy = home("Legacy resume");
    const readDatabase = vi.fn().mockResolvedValue(home("Database resume"));
    const readLegacy = vi.fn(() => legacy);

    await expect(
      selectPortfolioHome("legacy", "en", { readDatabase, readLegacy })
    ).resolves.toBe(legacy);
    expect(readLegacy).toHaveBeenCalledWith("en");
    expect(readDatabase).not.toHaveBeenCalled();
  });
});
