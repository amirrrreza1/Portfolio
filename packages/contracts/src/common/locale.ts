import { z } from "zod";

/**
 * The closed locale allowlist from
 * [I18N.md](../../../../docs/I18N.md) §1.
 *
 * Adding a locale is a code change plus a font and typography review — never a
 * database row. That is why this is a literal tuple here rather than a lookup:
 * a locale that has not been reviewed cannot appear at runtime, and TypeScript
 * forces every exhaustive switch over locales to be updated when one is added.
 */
export const LOCALES = ["en", "fa"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const localeSchema = z.enum(LOCALES);

/** Writing direction. Persian is RTL; this drives `dir` on the root element. */
export type TextDirection = "ltr" | "rtl";

export interface LocaleDefinition {
  readonly locale: Locale;
  readonly englishName: string;
  readonly nativeName: string;
  readonly direction: TextDirection;
  /** BCP 47 tag for `lang`, `hreflang`, and `Accept-Language` negotiation. */
  readonly bcp47: string;
  /** Fixed site UI font key. Distinct from the visitor-selectable blog font. */
  readonly siteFontKey: string;
}

export const LOCALE_DEFINITIONS: {
  readonly [K in Locale]: LocaleDefinition;
} = {
  en: {
    locale: "en",
    englishName: "English",
    nativeName: "English",
    direction: "ltr",
    bcp47: "en",
    siteFontKey: "jetbrains-mono",
  },
  fa: {
    locale: "fa",
    englishName: "Persian",
    nativeName: "فارسی",
    direction: "rtl",
    bcp47: "fa",
    siteFontKey: "vazir-code",
  },
} as const;

export function getLocaleDefinition(locale: Locale): LocaleDefinition {
  return LOCALE_DEFINITIONS[locale];
}

export function getTextDirection(locale: Locale): TextDirection {
  return LOCALE_DEFINITIONS[locale].direction;
}

/**
 * Type guard for untrusted input.
 *
 * Deliberately does not coerce: an unknown locale segment is a `404` and an
 * unknown `locale` parameter is `VALIDATION_FAILED`, never a silent fallback to
 * the default ([I18N.md](../../../../docs/I18N.md) §2,
 * [API_SPEC.md](../../../../docs/API_SPEC.md) §3). Serving the wrong language
 * quietly is worse than failing.
 */
export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" && (LOCALES as readonly string[]).includes(value)
  );
}

/**
 * A value present in some subset of locales.
 *
 * Used for the per-locale `jsonb` map pattern in
 * [DATA_MODEL.md](../../../../docs/DATA_MODEL.md) §4 — entities with one or two
 * short translatable strings, such as `NavItem.label` and `Quote.text`.
 * Entities with several translatable fields use a sidecar translation table
 * instead.
 */
export function localizedMapSchema<T extends z.ZodType>(
  value: T,
  options: { readonly requireDefaultLocale?: boolean } = {}
) {
  const { requireDefaultLocale = true } = options;

  const base = z.object({
    en: requireDefaultLocale ? value : value.optional(),
    fa: value.optional(),
  });

  return base;
}

/**
 * Which locales actually carry a value.
 *
 * Portfolio content falls back to English when Persian is absent
 * ([I18N.md](../../../../docs/I18N.md) §4), so without this the admin panel
 * could not tell a translated field from a fallback — the gap would be
 * invisible precisely because the fallback works.
 */
export function presentLocales(
  map: Partial<Record<Locale, unknown>>
): readonly Locale[] {
  return LOCALES.filter((locale) => {
    const value = map[locale];
    if (value === undefined || value === null) return false;
    if (typeof value === "string") return value.trim().length > 0;
    return true;
  });
}

export function missingLocales(
  map: Partial<Record<Locale, unknown>>
): readonly Locale[] {
  const present = new Set(presentLocales(map));
  return LOCALES.filter((locale) => !present.has(locale));
}
