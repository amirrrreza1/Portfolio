import { describe, expect, it } from "vitest";

import {
  checkBadgeColorContrast,
  COLOR_CONTRAST_MINIMUM,
  contrastRatio,
  derivedLabelColor,
  relativeLuminance,
  THEME_PAGE_BACKGROUNDS,
} from "../src/appearance/contrast.js";
import { THEME_KEYS } from "../src/appearance/registry.js";

describe("relativeLuminance", () => {
  it("anchors at the two extremes", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 10);
  });

  it("rejects anything the stored-value schema would reject", () => {
    expect(() => relativeLuminance("#fff")).toThrow();
    expect(() => relativeLuminance("black")).toThrow();
  });
});

describe("contrastRatio", () => {
  it("produces the WCAG bounds", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#123456", "#123456")).toBeCloseTo(1, 10);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#0070f3", "#ffffff")).toBeCloseTo(
      contrastRatio("#ffffff", "#0070f3"),
      10
    );
  });
});

describe("derivedLabelColor", () => {
  it("matches the renderer's perceived-brightness rule, not luminance", () => {
    // #f7df1e has a relative luminance of 0.73 and a perceived brightness of
    // 0.85, so both rules agree here.
    expect(derivedLabelColor("#f7df1e")).toBe("#000000");
    expect(derivedLabelColor("#0070f3")).toBe("#ffffff");
    expect(derivedLabelColor("#000000")).toBe("#ffffff");
  });
});

describe("checkBadgeColorContrast", () => {
  it("fails black on the dark theme, which is the whole M2 finding", () => {
    const report = checkBadgeColorContrast("#000000");

    expect(report.passes).toBe(false);
    expect(report.failingThemes).toEqual(["dark"]);
    // Black against a black page is literally no boundary at all.
    expect(
      report.themes.find((theme) => theme.theme === "dark")?.fillContrast
    ).toBeCloseTo(1, 10);
    // ...while its derived label is perfectly readable, which is why a
    // label-only check would have passed this colour.
    expect(report.labelColor).toBe("#ffffff");
    expect(report.labelContrast).toBeCloseTo(21, 5);
  });

  it("fails white on the light theme for the same reason", () => {
    const report = checkBadgeColorContrast("#ffffff");

    expect(report.passes).toBe(false);
    expect(report.failingThemes).toEqual(["light"]);
  });

  it("passes a colour that clears both theme backgrounds and its label", () => {
    const report = checkBadgeColorContrast("#0070f3");

    expect(report.passes).toBe(true);
    expect(report.failingThemes).toEqual([]);
    for (const theme of report.themes) {
      expect(theme.fillContrast).toBeGreaterThanOrEqual(COLOR_CONTRAST_MINIMUM);
    }
    expect(report.labelContrast).toBeGreaterThanOrEqual(COLOR_CONTRAST_MINIMUM);
  });

  it("checks every registered theme by default", () => {
    const report = checkBadgeColorContrast("#767676");

    expect(report.themes.map((theme) => theme.theme)).toEqual([...THEME_KEYS]);
    expect(report.themes.map((theme) => theme.background)).toEqual(
      THEME_KEYS.map((theme) => THEME_PAGE_BACKGROUNDS[theme])
    );
  });

  it("normalizes the colour it reports", () => {
    expect(checkBadgeColorContrast("#0070F3").color).toBe("#0070f3");
  });
});
