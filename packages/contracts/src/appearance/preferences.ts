import { z } from "zod";

import { type Locale } from "../common/locale.js";
import {
  APPEARANCE_DEFAULTS,
  type BlogFontKey,
  type BlogSizeStep,
  blogFontKeySchema,
  blogSizeStepSchema,
  fontSupportsLocale,
  type MotionPreference,
  motionPreferenceSchema,
  type ThemeKey,
  type ThemePreference,
  themePreferenceSchema,
} from "./registry.js";

/**
 * The `portfolio_prefs` cookie and its resolution against the owner's
 * allowlist, per [THEMING.md](../../../../docs/THEMING.md) §5 and §7.
 *
 * The rule that governs this whole module: **the visitor's choice wins over the
 * configured default, and the owner's allowlist wins over the visitor's
 * request.** An option that is not enabled cannot be selected by crafting a
 * cookie value.
 *
 * The cookie is not `HttpOnly` — the client reads it too — so its contents are
 * fully attacker-controlled. It therefore carries no personal data, no
 * identifier, and no security value, and every field is validated against the
 * allowlist on every request rather than trusted once at write time.
 */

export const PREFERENCES_COOKIE_NAME = "portfolio_prefs";

/**
 * Schema version.
 *
 * Present so an old cookie shape can be recognized and discarded rather than
 * partially parsed. A stale cookie resolving to defaults is correct behaviour;
 * a stale cookie half-matching a new schema is a bug that only appears for
 * returning visitors.
 */
export const PREFERENCES_VERSION = 1;

/**
 * The stored cookie payload.
 *
 * Every field is optional: absent means "no explicit choice", which resolves to
 * the configured default. That is different from an unrecognized value, which
 * is a tampering signal and also resolves to the default — but the distinction
 * is reported by `resolveAppearance` so callers can rewrite a corrupt cookie.
 */
export const appearanceCookieSchema = z
  .object({
    v: z.literal(PREFERENCES_VERSION),
    theme: themePreferenceSchema.optional(),
    blogFont: blogFontKeySchema.optional(),
    blogSize: blogSizeStepSchema.optional(),
    motion: motionPreferenceSchema.optional(),
  })
  .strict();

export type AppearanceCookie = z.infer<typeof appearanceCookieSchema>;

/**
 * The owner's configuration, mirroring the `AppearanceSettings` singleton in
 * [DATA_MODEL.md](../../../../docs/DATA_MODEL.md) §4.
 */
export interface AppearanceSettings {
  readonly enabledThemes: readonly ThemeKey[];
  readonly defaultTheme: ThemePreference;
  readonly enabledBlogFonts: readonly BlogFontKey[];
  readonly defaultBlogFontByLocale: { readonly [K in Locale]: BlogFontKey };
  readonly allowedBlogSizeSteps: readonly BlogSizeStep[];
  readonly defaultBlogSizeStep: BlogSizeStep;
  readonly offerMotionToggle: boolean;
}

/** What the server actually renders. Every field is a resolved, valid key. */
export interface ResolvedAppearance {
  readonly theme: ThemePreference;
  readonly blogFont: BlogFontKey;
  readonly blogSize: BlogSizeStep;
  readonly motion: MotionPreference;
  /**
   * True when at least one requested value was not selectable and fell back.
   *
   * The caller uses this to rewrite the cookie, so a visitor whose chosen theme
   * the owner disabled stops carrying a dead value on every request
   * (THEMING.md §7).
   */
  readonly corrected: boolean;
}

/**
 * Parses the raw cookie string.
 *
 * Never throws: a malformed cookie is indistinguishable from an absent one for
 * rendering purposes, and a parse error on a public request that a visitor
 * fully controls must not become a `500`.
 */
export function parseAppearanceCookie(
  raw: string | undefined | null
): AppearanceCookie | null {
  if (!raw) return null;

  // Bounded before parsing. The cookie is attacker-controlled and this runs on
  // every public request, so an oversized value is rejected without being
  // decoded at all.
  if (raw.length > 512) return null;

  let candidate: unknown;

  try {
    candidate = JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }

  const result = appearanceCookieSchema.safeParse(candidate);
  return result.success ? result.data : null;
}

export function serializeAppearanceCookie(
  preferences: Omit<AppearanceCookie, "v">
): string {
  const payload: AppearanceCookie = { v: PREFERENCES_VERSION, ...preferences };
  return encodeURIComponent(JSON.stringify(payload));
}

/**
 * Resolves a visitor's request against the owner's allowlist for one locale.
 *
 * This is the function that makes cookie tampering inert. It is intentionally
 * total — it always returns a renderable result — because it runs in the path
 * that produces the first HTML byte, and there is no meaningful way to fail.
 */
export function resolveAppearance(
  cookie: AppearanceCookie | null,
  settings: AppearanceSettings,
  locale: Locale
): ResolvedAppearance {
  let corrected = false;

  const requestedTheme = cookie?.theme;
  const themeAllowed =
    requestedTheme === "system"
      ? true
      : requestedTheme !== undefined &&
        settings.enabledThemes.includes(requestedTheme);

  if (requestedTheme !== undefined && !themeAllowed) corrected = true;

  const theme: ThemePreference = themeAllowed
    ? (requestedTheme as ThemePreference)
    : settings.defaultTheme;

  // A font must be both enabled by the owner and able to render this locale's
  // script. Enabled-but-incompatible is the case that matters: `jetbrains-mono`
  // is a legitimate site-wide option and still cannot set Persian text.
  const requestedFont = cookie?.blogFont;
  const fontAllowed =
    requestedFont !== undefined &&
    settings.enabledBlogFonts.includes(requestedFont) &&
    fontSupportsLocale(requestedFont, locale);

  if (requestedFont !== undefined && !fontAllowed) corrected = true;

  const blogFont: BlogFontKey = fontAllowed
    ? requestedFont
    : resolveDefaultBlogFont(settings, locale);

  const requestedSize = cookie?.blogSize;
  const sizeAllowed =
    requestedSize !== undefined &&
    settings.allowedBlogSizeSteps.includes(requestedSize);

  if (requestedSize !== undefined && !sizeAllowed) corrected = true;

  const blogSize: BlogSizeStep = sizeAllowed
    ? requestedSize
    : settings.defaultBlogSizeStep;

  // When the owner does not offer the motion toggle, a stored preference is
  // ignored rather than honoured — otherwise a visitor who set it while the
  // toggle was available would keep a setting the owner has since withdrawn.
  const requestedMotion = cookie?.motion;
  const motionAllowed =
    settings.offerMotionToggle && requestedMotion !== undefined;

  if (requestedMotion !== undefined && !settings.offerMotionToggle) {
    corrected = true;
  }

  const motion: MotionPreference = motionAllowed
    ? requestedMotion
    : APPEARANCE_DEFAULTS.motion;

  return { theme, blogFont, blogSize, motion, corrected };
}

/**
 * The default font for a locale, with a guaranteed script-compatible fallback.
 *
 * The owner's default is checked for compatibility rather than assumed: write
 * validation enforces it, but this runs on the public render path, and a render
 * path should not produce boxes because a validation rule was bypassed.
 */
function resolveDefaultBlogFont(
  settings: AppearanceSettings,
  locale: Locale
): BlogFontKey {
  const configured = settings.defaultBlogFontByLocale[locale];

  if (
    configured !== undefined &&
    settings.enabledBlogFonts.includes(configured) &&
    fontSupportsLocale(configured, locale)
  ) {
    return configured;
  }

  const compatible = settings.enabledBlogFonts.find((key) =>
    fontSupportsLocale(key, locale)
  );

  return compatible ?? APPEARANCE_DEFAULTS.blogFontByLocale[locale];
}

/**
 * Resolves `system` to a concrete theme once the client's media query is known.
 *
 * Server-side, `matchesDark` is unknown, so `system` is emitted as-is and the
 * reviewed pre-paint script settles it before first paint (THEMING.md §5).
 */
export function resolveSystemTheme(
  theme: ThemePreference,
  matchesDark: boolean
): ThemeKey {
  if (theme !== "system") return theme;
  return matchesDark ? "dark" : "light";
}

/**
 * The attributes the server-rendered shell emits.
 *
 * `data-theme` goes on `<html>`. `data-blog-font` and `data-blog-size` go on
 * `.blog-reading-surface` and **must not** appear on the root element or on
 * non-blog pages (THEMING.md §1, §5). Returning them as two separate objects
 * is what makes that boundary hard to get wrong at the call site.
 */
export function appearanceRootAttributes(appearance: ResolvedAppearance): {
  readonly "data-theme": ThemePreference;
  readonly "data-motion": MotionPreference;
} {
  return {
    "data-theme": appearance.theme,
    "data-motion": appearance.motion,
  };
}

export function blogSurfaceAttributes(appearance: ResolvedAppearance): {
  readonly "data-blog-font": BlogFontKey;
  readonly "data-blog-size": BlogSizeStep;
} {
  return {
    "data-blog-font": appearance.blogFont,
    "data-blog-size": appearance.blogSize,
  };
}
