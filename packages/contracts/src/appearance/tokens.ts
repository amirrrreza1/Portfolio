import { type HexColor, hexColorSchema } from "../common/values.js";
import { contrastRatio, COLOR_CONTRAST_MINIMUM } from "./contrast.js";
import { THEME_KEYS, type ThemeKey } from "./registry.js";

/**
 * The theme token vocabulary from
 * [THEMING.md](../../../../docs/THEMING.md) §3, and the WCAG 2.2 AA matrix over
 * it required by §9.
 *
 * This file is the *contract* for the token set. The CSS that actually paints
 * it lives in `apps/web/src/app/globals.css`, and
 * `apps/web/test/theme-tokens.spec.ts` asserts the two agree value for value —
 * including the two `system` media-query fallbacks, which are the copies most
 * likely to drift. Declaring the values here rather than parsing CSS is what
 * lets the check run in `@portfolio/contracts` with no DOM and no build step,
 * and it is the same shape [contrast.ts](./contrast.ts) already uses for
 * `THEME_PAGE_BACKGROUNDS`.
 *
 * Contrast is measured on the *declared* token values. Utilities that thin a
 * token with an opacity modifier — the old `text-secondary/70` — are outside
 * what this can check, which is precisely why the migration replaced them with
 * real tokens instead of keeping the opacities.
 */

/** Every token a theme must declare. Order is the declaration order in CSS. */
export const THEME_TOKEN_NAMES = [
  "bg",
  "surface",
  "border",
  "text",
  "text-muted",
  "primary",
  "secondary",
  "accent",
  "danger",
  "success",
  "code-bg",
  "code-text",
  "particle",
  "scrim",
] as const;

export type ThemeTokenName = (typeof THEME_TOKEN_NAMES)[number];

export type ThemeTokenSet = { readonly [K in ThemeTokenName]: HexColor };

/**
 * The declared value of every token in every theme.
 *
 * Values are per-theme rather than shared. Under the previous vocabulary
 * `--color-Gold`, `--color-main-red`, and `--color-main-green` each carried one
 * value across both themes, and five pairings failed AA as a result. A colour
 * required to clear 4.5:1 against both `#000000` and `#ffffff` is squeezed
 * toward mid-grey; per-theme values are what make AA reachable without
 * flattening the palette.
 */
export const THEME_TOKENS: { readonly [K in ThemeKey]: ThemeTokenSet } = {
  dark: {
    bg: "#000000",
    surface: "#1a1a1a",
    border: "#666666",
    text: "#ffffff",
    "text-muted": "#a3a3a3",
    primary: "#ffffff",
    secondary: "#333333",
    accent: "#d0c39d",
    danger: "#f43f5e",
    success: "#22c55d",
    "code-bg": "#0d1117",
    "code-text": "#c9d1d9",
    particle: "#a3a3a3",
    scrim: "#000000",
  },
  light: {
    bg: "#ffffff",
    surface: "#f2f2f2",
    border: "#858585",
    text: "#000000",
    "text-muted": "#5c5c5c",
    primary: "#000000",
    secondary: "#e5e5e5",
    accent: "#6b5a2a",
    danger: "#e11d48",
    success: "#15803d",
    "code-bg": "#ffffff",
    "code-text": "#24292e",
    particle: "#5c5c5c",
    scrim: "#000000",
  },
} as const;

/**
 * AA for a user-interface component or graphical object, WCAG 2.2 SC 1.4.11.
 *
 * Borders and the focus ring are held to this rather than to
 * `COLOR_CONTRAST_MINIMUM`. They are not text: 1.4.3 does not apply to them and
 * demanding 4.5:1 from a card outline would force every border to look like a
 * rule. 1.4.11 is the correct bound, and it is a real bound — the previous
 * `border-secondary/40` resolved to `#666666` on dark, which clears it, and to
 * `#999999` on light, which does not.
 */
export const NON_TEXT_CONTRAST_MINIMUM = 3;

/**
 * A pairing that must clear a minimum, named for the thing a visitor sees.
 *
 * The list covers §9's requirement — "body text, muted text, links, focus
 * rings, meaningful borders, and both code themes" — plus the two fills whose
 * label colour is a different token from body text, because those are the
 * pairings a rename can silently break.
 */
export interface ThemeContrastPair {
  readonly id: string;
  readonly foreground: ThemeTokenName;
  readonly background: ThemeTokenName;
  readonly minimum: number;
  /** Why this pairing exists, for the failure message. */
  readonly describes: string;
}

export const THEME_CONTRAST_PAIRS: readonly ThemeContrastPair[] = [
  {
    id: "body-text",
    foreground: "text",
    background: "bg",
    minimum: COLOR_CONTRAST_MINIMUM,
    describes: "body text on the page",
  },
  {
    id: "body-text-on-surface",
    foreground: "text",
    background: "surface",
    minimum: COLOR_CONTRAST_MINIMUM,
    describes: "body text on a raised surface",
  },
  {
    id: "muted-text",
    foreground: "text-muted",
    background: "bg",
    minimum: COLOR_CONTRAST_MINIMUM,
    describes: "secondary and placeholder text on the page",
  },
  {
    id: "muted-text-on-surface",
    foreground: "text-muted",
    background: "surface",
    minimum: COLOR_CONTRAST_MINIMUM,
    describes: "secondary text on a raised surface",
  },
  {
    id: "link",
    foreground: "text",
    background: "bg",
    minimum: COLOR_CONTRAST_MINIMUM,
    describes:
      "links, which render as body text with an underline rather than in a colour of their own",
  },
  {
    id: "primary-fill-label",
    foreground: "bg",
    background: "primary",
    minimum: COLOR_CONTRAST_MINIMUM,
    describes: "the label on a filled primary control",
  },
  {
    id: "secondary-fill-label",
    foreground: "text",
    background: "secondary",
    minimum: COLOR_CONTRAST_MINIMUM,
    describes: "the label on a filled secondary control",
  },
  {
    id: "accent-text",
    foreground: "accent",
    background: "bg",
    minimum: COLOR_CONTRAST_MINIMUM,
    describes: "accent text on the page",
  },
  {
    id: "danger-text",
    foreground: "danger",
    background: "bg",
    minimum: COLOR_CONTRAST_MINIMUM,
    describes: "validation errors and the in-progress project status",
  },
  {
    id: "success-text",
    foreground: "success",
    background: "bg",
    minimum: COLOR_CONTRAST_MINIMUM,
    describes: "the completed project status",
  },
  {
    id: "code",
    foreground: "code-text",
    background: "code-bg",
    minimum: COLOR_CONTRAST_MINIMUM,
    describes: "the Shiki code theme for this theme",
  },
  {
    id: "border",
    foreground: "border",
    background: "bg",
    minimum: NON_TEXT_CONTRAST_MINIMUM,
    describes: "a border that carries meaning, such as a card or field outline",
  },
  {
    id: "focus-ring",
    foreground: "primary",
    background: "bg",
    minimum: NON_TEXT_CONTRAST_MINIMUM,
    describes: "the keyboard focus ring",
  },
];

export interface ThemeContrastPairResult {
  readonly id: string;
  readonly describes: string;
  readonly foreground: HexColor;
  readonly background: HexColor;
  readonly ratio: number;
  readonly minimum: number;
  readonly passes: boolean;
}

export interface ThemeContrastReport {
  readonly theme: ThemeKey;
  readonly pairs: readonly ThemeContrastPairResult[];
  readonly passes: boolean;
  /** Pair ids below their minimum, in declaration order. */
  readonly failing: readonly string[];
}

/**
 * Measures every pairing in one theme.
 *
 * `tokens` is injectable so a candidate palette can be checked before it is
 * written into CSS, which is how the values in `THEME_TOKENS` were chosen.
 */
export function checkThemeContrast(
  theme: ThemeKey,
  tokens: ThemeTokenSet = THEME_TOKENS[theme]
): ThemeContrastReport {
  const pairs = THEME_CONTRAST_PAIRS.map((pair) => {
    const foreground = hexColorSchema.parse(tokens[pair.foreground]);
    const background = hexColorSchema.parse(tokens[pair.background]);
    const ratio = contrastRatio(foreground, background);
    return {
      id: pair.id,
      describes: pair.describes,
      foreground,
      background,
      ratio,
      minimum: pair.minimum,
      passes: ratio >= pair.minimum,
    } satisfies ThemeContrastPairResult;
  });

  return {
    theme,
    pairs,
    passes: pairs.every((pair) => pair.passes),
    failing: pairs.filter((pair) => !pair.passes).map((pair) => pair.id),
  };
}

/** Every enabled theme. Defaults to the whole registry, as `contrast.ts` does. */
export function checkAllThemeContrast(
  themes: readonly ThemeKey[] = THEME_KEYS
): readonly ThemeContrastReport[] {
  return themes.map((theme) => checkThemeContrast(theme));
}

/** A one-line-per-pair rendering, for evidence files and failure output. */
export function formatThemeContrastReport(report: ThemeContrastReport): string {
  return report.pairs
    .map(
      (pair) =>
        `${pair.passes ? "PASS" : "FAIL"}  ${report.theme.padEnd(5)} ` +
        `${pair.id.padEnd(22)} ${pair.foreground} on ${pair.background} = ` +
        `${pair.ratio.toFixed(2)}:1 (min ${pair.minimum.toFixed(1)}:1)`
    )
    .join("\n");
}
