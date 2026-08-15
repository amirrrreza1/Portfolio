import { hexColorSchema, type HexColor } from "../common/values.js";
import { THEME_KEYS, type ThemeKey } from "./registry.js";

/**
 * WCAG 2.2 contrast for stored colours, against the code-declared themes.
 *
 * [values.ts](../common/values.ts) validates the *shape* of a colour and
 * deliberately stops there, because contrast needs the theme registry. This is
 * the module it points at.
 *
 * Only one stored value is a colour today — `Skill.color`
 * ([DATA_MODEL.md](../../../../docs/DATA_MODEL.md) §5) — and it is rendered as a
 * badge fill whose label colour is *derived* from the fill. That makes two
 * independent checks, not one:
 *
 *   1. The fill against the page background of every enabled theme. A badge is
 *      a bounded region carrying meaning, so it needs contrast on both the
 *      black dark-theme surface and the white light-theme surface. This is the
 *      check `#000000` fails: on the dark theme the badge and the page are the
 *      same colour and the boundary disappears.
 *   2. The derived label against its own fill, because a fill that only passes
 *      check 1 can still swallow its text.
 *
 * The colour itself is never interpolated into CSS by this module — it returns
 * numbers and verdicts. Rendering it remains subject to THEMING.md §8.
 */

/**
 * The page background each theme paints, mirroring `--color-primary` in
 * `apps/web/src/app/globals.css`.
 *
 * `system` is absent on purpose: it is a resolution mode that lands on one of
 * these two, so checking both already covers it.
 */
export const THEME_PAGE_BACKGROUNDS: { readonly [K in ThemeKey]: HexColor } = {
  dark: "#000000",
  light: "#ffffff",
} as const;

/**
 * AA for normal text. Applied to the badge fill as well as its label.
 *
 * WCAG would allow 3:1 for the fill alone, since it is a non-text boundary.
 * The stricter bound is used deliberately: a skill badge is small, it is often
 * the only thing distinguishing one chip from the next, and 4.5:1 against both
 * a black and a white surface is achievable — a colour with relative luminance
 * near 0.18 clears it on both. Choosing the weaker bound would buy nothing
 * except colours that are hard to see.
 */
export const COLOR_CONTRAST_MINIMUM = 4.5;

/** Relative luminance, WCAG 2.2 §Relative luminance. */
export function relativeLuminance(color: string): number {
  const hex = hexColorSchema.parse(color).slice(1);
  const linear = (channel: number): number => {
    const value = channel / 255;
    return value <= 0.040_45
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  };
  const red = linear(Number.parseInt(hex.slice(0, 2), 16));
  const green = linear(Number.parseInt(hex.slice(2, 4), 16));
  const blue = linear(Number.parseInt(hex.slice(4, 6), 16));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** Contrast ratio between two colours, from 1 through 21. */
export function contrastRatio(first: string, second: string): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * The label colour a badge fill produces at render time.
 *
 * This reproduces the legacy rule in `apps/web/src/Utils/getTextColor.ts` —
 * a perceived-brightness threshold, not relative luminance. It is repeated
 * rather than corrected because the point of this function is to predict what
 * the renderer will actually do; validating against a rule the renderer does
 * not use would pass colours that then render unreadably.
 */
export function derivedLabelColor(fill: string): HexColor {
  const hex = hexColorSchema.parse(fill).slice(1);
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  const perceived = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return perceived > 0.6 ? "#000000" : "#ffffff";
}

export interface ThemeContrastResult {
  readonly theme: ThemeKey;
  readonly background: HexColor;
  /** Badge fill against the theme's page background. */
  readonly fillContrast: number;
  readonly passes: boolean;
}

export interface BadgeColorContrastReport {
  readonly color: HexColor;
  readonly minimum: number;
  readonly labelColor: HexColor;
  /** Derived label against the badge fill. Theme-independent. */
  readonly labelContrast: number;
  readonly themes: readonly ThemeContrastResult[];
  readonly passes: boolean;
  /** Theme keys whose fill contrast is below the minimum, in registry order. */
  readonly failingThemes: readonly ThemeKey[];
}

/**
 * Checks one badge colour against every enabled theme.
 *
 * `themes` defaults to the whole registry rather than to `AppearanceSettings`,
 * because a colour stored today outlives the enabled set: a theme disabled at
 * write time can be re-enabled later, and re-enabling a theme should not
 * quietly turn stored data inaccessible.
 */
export function checkBadgeColorContrast(
  color: string,
  themes: readonly ThemeKey[] = THEME_KEYS
): BadgeColorContrastReport {
  const fill = hexColorSchema.parse(color);
  const labelColor = derivedLabelColor(fill);
  const labelContrast = contrastRatio(fill, labelColor);
  const results = themes.map((theme) => {
    const background = THEME_PAGE_BACKGROUNDS[theme];
    const fillContrast = contrastRatio(fill, background);
    return {
      theme,
      background,
      fillContrast,
      passes: fillContrast >= COLOR_CONTRAST_MINIMUM,
    } satisfies ThemeContrastResult;
  });

  return {
    color: fill,
    minimum: COLOR_CONTRAST_MINIMUM,
    labelColor,
    labelContrast,
    themes: results,
    passes:
      labelContrast >= COLOR_CONTRAST_MINIMUM &&
      results.every((result) => result.passes),
    failingThemes: results
      .filter((result) => !result.passes)
      .map((result) => result.theme),
  };
}
