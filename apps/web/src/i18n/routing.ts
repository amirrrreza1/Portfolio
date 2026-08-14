import {
  DEFAULT_LOCALE,
  encodeSlugForUrl,
  slugSchemaFor,
  type Locale,
} from "@portfolio/contracts/common";

export function localePath(locale: Locale, pathname = ""): string {
  const normalizedPath = pathname.replace(/^\/+|\/+$/g, "");
  return normalizedPath ? `/${locale}/${normalizedPath}` : `/${locale}`;
}

/** Preserve the current public route while replacing its explicit locale. */
export function switchLocalePath(pathname: string, locale: Locale): string {
  const withoutLocale = pathname.replace(/^\/(?:en|fa)(?=\/|$)/, "");
  return localePath(locale, withoutLocale);
}

export function articlePath(locale: Locale, slugInput: string): string {
  const slug = slugSchemaFor(locale).parse(slugInput);
  return localePath(locale, `blog/${encodeSlugForUrl(slug)}`);
}

export function legacyLocaleRedirect(
  pathname: string,
  rootLocale: Locale = DEFAULT_LOCALE
): string | null {
  if (pathname === "/") return localePath(rootLocale);
  if (pathname === "/projects" || pathname === "/projects/") {
    return localePath("en", "projects");
  }
  if (pathname === "/blog" || pathname === "/blog/") {
    return localePath("en", "blog");
  }
  return null;
}
