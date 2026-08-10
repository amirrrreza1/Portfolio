import { z } from "zod";

import { type Locale, LOCALES } from "../common/locale.js";

/**
 * The code-declared appearance registries from
 * [THEMING.md](../../../../docs/THEMING.md) §3–§4.
 *
 * The single most important property of this file: **every appearance value is
 * a key, and every key selects static, authored CSS.** No stored value is ever
 * interpolated into a `style` attribute, a `<style>` block, a custom property
 * value, or a font URL (THEMING.md §8). That is the whole reason a visitor
 * preference feature is not a CSS injection surface, and it is why the registry
 * lives in code rather than in the database.
 *
 * `AppearanceSettings` stores which of these keys are enabled and which is the
 * default. It cannot add a key that is not here.
 */

/** Theme token sets. `system` is a resolution mode, not a token set. */
export const THEME_KEYS = ["dark", "light"] as const;

export type ThemeKey = (typeof THEME_KEYS)[number];

export const themeKeySchema = z.enum(THEME_KEYS);

/**
 * What a visitor may select, including following the operating system.
 *
 * `system` is separate from `ThemeKey` because it resolves to one of the real
 * themes at paint time — the server cannot evaluate `prefers-color-scheme`, so
 * it is the one case needing the reviewed nonced pre-paint script
 * (THEMING.md §5).
 */
export const THEME_PREFERENCES = [...THEME_KEYS, "system"] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const themePreferenceSchema = z.enum(THEME_PREFERENCES);

/** Scripts a font must support to be offered for a locale. */
export type FontScript = "latin" | "arabic";

export const LOCALE_SCRIPTS: { readonly [K in Locale]: FontScript } = {
  en: "latin",
  fa: "arabic",
} as const;

export interface BlogFontDefinition {
  readonly key: BlogFontKey;
  readonly displayName: string;
  readonly scripts: readonly FontScript[];
  /** True when the family needs no download at all. */
  readonly selfHosted: boolean;
}

export const BLOG_FONT_KEYS = [
  "jetbrains-mono",
  "vazir-code",
  "system-sans",
] as const;

export type BlogFontKey = (typeof BLOG_FONT_KEYS)[number];

export const blogFontKeySchema = z.enum(BLOG_FONT_KEYS);

/**
 * The initial registry from THEMING.md §4.
 *
 * The CSS family stack and `@font-face` sources deliberately are **not** here.
 * They belong to the stylesheet, and keeping them out of a shared contracts
 * package means no server or API code can ever construct font CSS from a
 * stored value.
 */
export const BLOG_FONTS: { readonly [K in BlogFontKey]: BlogFontDefinition } = {
  "jetbrains-mono": {
    key: "jetbrains-mono",
    displayName: "JetBrains Mono",
    scripts: ["latin"],
    selfHosted: true,
  },
  "vazir-code": {
    key: "vazir-code",
    displayName: "Vazir Code",
    scripts: ["arabic", "latin"],
    selfHosted: true,
  },
  "system-sans": {
    key: "system-sans",
    displayName: "System sans",
    scripts: ["latin", "arabic"],
    selfHosted: false,
  },
} as const;

/**
 * Blog text-size steps.
 *
 * Steps rather than free numbers, because the sizes are authored CSS classes.
 * An arbitrary number would have to be interpolated into a style value, which
 * §8 forbids.
 */
export const BLOG_SIZE_STEPS = ["sm", "md", "lg", "xl"] as const;

export type BlogSizeStep = (typeof BLOG_SIZE_STEPS)[number];

export const blogSizeStepSchema = z.enum(BLOG_SIZE_STEPS);

/** Motion preference. `system` defers to `prefers-reduced-motion`. */
export const MOTION_PREFERENCES = ["system", "full", "reduced"] as const;

export type MotionPreference = (typeof MOTION_PREFERENCES)[number];

export const motionPreferenceSchema = z.enum(MOTION_PREFERENCES);

/**
 * Fonts that can render a locale's script.
 *
 * THEMING.md §4: a family that does not support the current locale's script
 * cannot be selected in that locale, and the switcher only offers
 * script-compatible options. Persian text set in a Latin-only family renders as
 * missing-glyph boxes, so this is a correctness rule, not a preference.
 */
export function fontsSupportingLocale(locale: Locale): readonly BlogFontKey[] {
  const script = LOCALE_SCRIPTS[locale];
  return BLOG_FONT_KEYS.filter((key) =>
    BLOG_FONTS[key].scripts.includes(script)
  );
}

export function fontSupportsLocale(
  fontKey: BlogFontKey,
  locale: Locale
): boolean {
  return BLOG_FONTS[fontKey].scripts.includes(LOCALE_SCRIPTS[locale]);
}

/** Site-wide defaults used before any owner configuration exists. */
export const APPEARANCE_DEFAULTS = {
  theme: "dark" satisfies ThemePreference,
  blogSize: "md" satisfies BlogSizeStep,
  motion: "system" satisfies MotionPreference,
  blogFontByLocale: {
    en: "jetbrains-mono",
    fa: "vazir-code",
  } as { readonly [K in Locale]: BlogFontKey },
} as const;

/** Every locale must have a script-compatible default. Checked at module load. */
for (const locale of LOCALES) {
  const fontKey = APPEARANCE_DEFAULTS.blogFontByLocale[locale];
  if (!fontSupportsLocale(fontKey, locale)) {
    throw new Error(
      `Default blog font "${fontKey}" cannot render the ${locale} script.`
    );
  }
}
