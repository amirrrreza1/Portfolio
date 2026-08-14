import {
  DEFAULT_LOCALE,
  isLocale,
  type Locale,
} from "@portfolio/contracts/common";

export const LOCALE_COOKIE_NAME = "portfolio_locale";
export const LOCALE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/** Resolve only the bare-root locale: cookie, Accept-Language, then English. */
export function negotiateRootLocale(
  cookieValue: string | undefined,
  acceptLanguage: string | null
): Locale {
  if (isLocale(cookieValue)) return cookieValue;
  return negotiateAcceptLanguage(acceptLanguage) ?? DEFAULT_LOCALE;
}

export function negotiateAcceptLanguage(value: string | null): Locale | null {
  if (value === null || value.length === 0 || value.length > 4_096) return null;
  let best: {
    readonly locale: Locale;
    readonly quality: number;
    readonly order: number;
  } | null = null;

  for (const [order, rawEntry] of value.split(",").entries()) {
    const parts = rawEntry.trim().split(";");
    const range = parts[0]?.trim().toLowerCase();
    if (!range) continue;
    let quality = 1;
    let invalidQuality = false;
    for (const parameter of parts.slice(1)) {
      const normalizedParameter = parameter.trim();
      if (!/^q=/i.test(normalizedParameter)) continue;
      const match = /^q=(0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/i.exec(
        normalizedParameter
      );
      if (match === null) {
        invalidQuality = true;
        break;
      }
      quality = Number(match[1]);
    }
    if (invalidQuality || quality <= 0) continue;

    const locale =
      range === "*"
        ? DEFAULT_LOCALE
        : range === "en" || range.startsWith("en-")
          ? "en"
          : range === "fa" || range.startsWith("fa-")
            ? "fa"
            : null;
    if (locale === null) continue;
    if (
      best === null ||
      quality > best.quality ||
      (quality === best.quality && order < best.order)
    ) {
      best = { locale, quality, order };
    }
  }

  return best?.locale ?? null;
}

/** Client-writable preference; it contains no identifier or personal data. */
export function localePreferenceCookie(
  locale: Locale,
  secure: boolean
): string {
  return `${LOCALE_COOKIE_NAME}=${locale}; Path=/; SameSite=Lax; Max-Age=${LOCALE_COOKIE_MAX_AGE_SECONDS}${secure ? "; Secure" : ""}`;
}
