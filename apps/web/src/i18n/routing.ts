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

/**
 * The slug a route param actually carries.
 *
 * Next.js hands a dynamic segment through **percent-encoded** when the segment
 * contains non-ASCII characters, so a Persian slug arrives as
 * `%D9%85%D8%A7...` rather than as `ماتریس-تم`. Validating that against
 * `slugSchemaFor("fa")` fails, and the route answers 404 for every Persian
 * article — including the links `articlePath` itself generates on the blog
 * index. ASCII slugs never showed it, because Next normalizes the safe escapes
 * in an ASCII path before the route sees it.
 *
 * Decoding is fallible: `%E0%A4%A` throws `URIError`. A malformed escape is a
 * 404, never an unhandled server error, so this returns `null` rather than
 * throwing and the caller keeps its normal not-found path.
 *
 * The middleware's `classifyPublicRoute` and the article `not-found` boundary
 * already decode; this is the same rule for the route itself.
 */
export function decodeSlugParam(input: string): string | null {
  try {
    return decodeURIComponent(input);
  } catch {
    return null;
  }
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
