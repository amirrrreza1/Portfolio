import { describe, expect, it } from "vitest";

import {
  checkAllThemeContrast,
  checkThemeContrast,
  formatThemeContrastReport,
  NON_TEXT_CONTRAST_MINIMUM,
  THEME_CONTRAST_PAIRS,
  THEME_KEYS,
  THEME_PAGE_BACKGROUNDS,
  THEME_TOKEN_NAMES,
  THEME_TOKENS,
  type ThemeTokenSet,
} from "../src/appearance/index.js";

describe("theme tokens", () => {
  it("declares the complete vocabulary in every theme", () => {
    for (const theme of THEME_KEYS) {
      expect(Object.keys(THEME_TOKENS[theme]).sort()).toEqual(
        [...THEME_TOKEN_NAMES].sort()
      );
    }
  });

  it("keeps the badge checker's page backgrounds equal to the bg token", () => {
    // Two tables describe the same colour. They were written months apart and
    // the migration renamed the property one of them cites, so the equality is
    // asserted rather than assumed.
    for (const theme of THEME_KEYS) {
      expect(THEME_TOKENS[theme].bg).toBe(THEME_PAGE_BACKGROUNDS[theme]);
    }
  });

  it("keeps the scrim theme-independent", () => {
    // A scrim darkens whatever is behind it. Flipping it with the theme would
    // make the light theme's backdrop white, which dims nothing.
    const [first, ...rest] = THEME_KEYS.map(
      (theme) => THEME_TOKENS[theme].scrim
    );
    for (const value of rest) {
      expect(value).toBe(first);
    }
  });
});

describe("theme contrast — THEMING.md §9", () => {
  it.each([...THEME_KEYS])("%s passes every pairing", (theme) => {
    const report = checkThemeContrast(theme);
    expect(report.failing, `\n${formatThemeContrastReport(report)}\n`).toEqual(
      []
    );
    expect(report.passes).toBe(true);
  });

  it("covers body text, muted text, links, focus ring, borders, and code", () => {
    // The gate is the *coverage*, not just the ratios: a pairing that quietly
    // stops being measured passes vacuously.
    const ids = new Set(THEME_CONTRAST_PAIRS.map((pair) => pair.id));
    for (const required of [
      "body-text",
      "muted-text",
      "link",
      "focus-ring",
      "border",
      "code",
    ]) {
      expect(ids.has(required)).toBe(true);
    }
  });

  it("holds text to 4.5:1 and non-text to 3:1", () => {
    const border = THEME_CONTRAST_PAIRS.find((pair) => pair.id === "border");
    const body = THEME_CONTRAST_PAIRS.find((pair) => pair.id === "body-text");
    expect(border?.minimum).toBe(NON_TEXT_CONTRAST_MINIMUM);
    expect(body?.minimum).toBe(4.5);
  });

  it("reports the failure rather than throwing on a bad palette", () => {
    // The pre-migration light theme, to prove the matrix would have caught it:
    // one shared Gold across both themes is 1.75:1 on white, and grey-400 muted
    // text is 2.60:1.
    const broken: ThemeTokenSet = {
      ...THEME_TOKENS.light,
      accent: "#d0c39d",
      "text-muted": "#99a1af",
      border: "#999999",
    };
    const report = checkThemeContrast("light", broken);

    expect(report.passes).toBe(false);
    expect(report.failing).toEqual([
      "muted-text",
      "muted-text-on-surface",
      "accent-text",
      "border",
    ]);

    const accent = report.pairs.find((pair) => pair.id === "accent-text");
    expect(accent?.ratio).toBeCloseTo(1.75, 2);
  });

  it("checks every theme in the registry by default", () => {
    expect(checkAllThemeContrast().map((report) => report.theme)).toEqual([
      ...THEME_KEYS,
    ]);
  });
});
