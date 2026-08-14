import { publicAppearanceSchema } from "@portfolio/contracts/appearance";
import { describe, expect, it, vi } from "vitest";

import { selectPortfolioAppearance } from "../src/server/portfolio-appearance-source";

function appearance(defaultTheme: "dark" | "light") {
  return publicAppearanceSchema.parse({
    locale: "en",
    themes: ["dark", "light"],
    defaultTheme,
    blogFonts: [
      { key: "jetbrains-mono", displayName: "JetBrains Mono" },
      { key: "vazir-code", displayName: "Vazir Code" },
      { key: "system-sans", displayName: "System sans" },
    ],
    defaultBlogFont: "jetbrains-mono",
    blogSizes: ["sm", "md", "lg", "xl"],
    defaultBlogSize: "md",
    offerMotionToggle: true,
  });
}

describe("portfolio appearance source switch", () => {
  it("uses only the database reader when selected", async () => {
    const database = appearance("light");
    const readDatabase = vi.fn().mockResolvedValue(database);
    const readLegacy = vi.fn(() => appearance("dark"));

    await expect(
      selectPortfolioAppearance("database", "en", {
        readDatabase,
        readLegacy,
      })
    ).resolves.toBe(database);
    expect(readDatabase).toHaveBeenCalledWith("en");
    expect(readLegacy).not.toHaveBeenCalled();
  });

  it("uses only the legacy reader when rollback is selected", async () => {
    const legacy = appearance("dark");
    const readDatabase = vi.fn().mockResolvedValue(appearance("light"));
    const readLegacy = vi.fn(() => legacy);

    await expect(
      selectPortfolioAppearance("legacy", "en", {
        readDatabase,
        readLegacy,
      })
    ).resolves.toBe(legacy);
    expect(readLegacy).toHaveBeenCalledWith("en");
    expect(readDatabase).not.toHaveBeenCalled();
  });
});
