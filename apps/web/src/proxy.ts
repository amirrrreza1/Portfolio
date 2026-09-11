import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@portfolio/contracts/auth";
import { getLocaleDefinition, isLocale } from "@portfolio/contracts/common";

import { legacyLocaleRedirect } from "./i18n/routing";
import { getMessages } from "./i18n/messages";
import { parsePortfolioDataSource } from "./server/portfolio-data-source";
import {
  ADMIN_LOGIN_PATH,
  isAdminPath,
  UNAUTHENTICATED_ADMIN_PATHS,
} from "./server/admin-routes";
import {
  checkDefaultPublicRouteAvailability,
  type PublicRouteAvailability,
} from "./server/public-route-availability";

function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

function securityPolicy(nonce: string): string {
  const development = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    `script-src 'self' 'nonce-${nonce}'${development ? " 'unsafe-eval'" : ""}`,
    `style-src 'self'${development ? " 'unsafe-inline'" : ""}`,
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "form-action 'self'",
  ].join("; ");
}

/**
 * The public documents that are meant to be cached by shared caches.
 *
 * Every other public response carries `private, no-store` because the HTML
 * shell is per-visitor: it embeds the appearance cookie's resolved theme in
 * its first byte. Feeds, sitemaps and `robots.txt` embed nothing of the sort —
 * they are identical for every visitor — and a crawler or feed reader polling
 * them is exactly the traffic a shared cache should absorb. Their route
 * handlers set the real policy; this list is what stops the blanket header
 * from overwriting it.
 */
const PUBLIC_DISCOVERY_PATH =
  /^\/(?:robots\.txt|sitemap\.xml|(?:en|fa)\/(?:sitemap\.xml|blog\/feed\.xml))$/;

function secure(response: NextResponse, nonce: string): NextResponse {
  response.headers.set("Content-Security-Policy", securityPolicy(nonce));
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

/**
 * The admin surface, per SECURITY.md §10 and ROADMAP.md §6.
 *
 * Admin responses do not share the public policy. The differences are all in
 * the same direction — the admin panel loads nothing from anywhere else, is
 * never indexed, and must not appear in any cache or referrer.
 */
/**
 * Stricter than the public policy in every clause it changes.
 *
 * `img-src` drops `https:` and `blob:`: the public site renders remote media,
 * the admin shell renders none, and an admin page that can load an arbitrary
 * remote image is an admin page that can leak the fact it was opened. `frame-`,
 * `worker-`, `manifest-` and `media-src` are named `'none'` explicitly rather
 * than left to `default-src`, so that a later `default-src` relaxation cannot
 * silently widen them.
 *
 * Production `style-src` is self-only. Development additionally permits
 * inline styles because Turbopack's devtools and React Three Fiber's canvas
 * sizing inject them; that exception is selected only by Next's fixed
 * `NODE_ENV=development` process mode and never reaches a production build.
 * Syntax highlighting converts Shiki's finite
 * dual-theme palette to static classes before sanitized HTML is persisted, so
 * neither public content nor the shared admin preview needs inline styles.
 */
function adminSecurityPolicy(nonce: string): string {
  const development = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "manifest-src 'none'",
    "media-src 'none'",
    `script-src 'self' 'nonce-${nonce}'${development ? " 'unsafe-eval'" : ""}`,
    `style-src 'self'${development ? " 'unsafe-inline'" : ""}`,
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "form-action 'self'",
  ].join("; ");
}

function secureAdmin(response: NextResponse, nonce: string): NextResponse {
  response.headers.set("Content-Security-Policy", adminSecurityPolicy(nonce));
  // Not `strict-origin-when-cross-origin`: an admin URL names the resource
  // being administered, and there is no destination that needs to learn it.
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  // Safe here precisely because the shell embeds nothing cross-origin: under
  // `require-corp` a same-origin subresource needs no opt-in, so this costs
  // the panel nothing and refuses anything that is later added carelessly.
  response.headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  // WebAuthn is named explicitly. Both directives already default to `self`,
  // but SECURITY.md §10 asks for a policy that has been *tested against*
  // WebAuthn, and a policy that never mentions it is one nobody checked.
  response.headers.set(
    "Permissions-Policy",
    [
      "camera=()",
      "microphone=()",
      "geolocation=()",
      "payment=()",
      "usb=()",
      "publickey-credentials-get=(self)",
      "publickey-credentials-create=(self)",
    ].join(", ")
  );
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  response.headers.set("Vary", "Cookie");
  return response;
}

/**
 * The cheap half of the admin boundary.
 *
 * This is a **presence** check, not authentication: it only asks whether a
 * session cookie was sent at all, so that a signed-out visitor is redirected
 * before any admin code renders. It cannot tell a valid token from a forged
 * one and does not try — every admin surface independently asks the API, which
 * re-reads the session record and its expiry, revocation, and account status.
 *
 * Doing it here as well is what makes "the admin shell cannot be reached
 * without verified credentials" true of the *whole prefix* rather than of the
 * routes someone remembered to guard.
 */
function hasSessionCookie(request: NextRequest): boolean {
  for (const name of [
    SESSION_COOKIE_NAME,
    SESSION_COOKIE_NAME.replace(/^__Host-/, ""),
  ]) {
    const value = request.cookies.get(name)?.value;
    if (value !== undefined && value.length > 0) return true;
  }
  return false;
}

function handleAdminRequest(
  request: NextRequest,
  pathname: string,
  nonce: string
): NextResponse {
  if (
    !UNAUTHENTICATED_ADMIN_PATHS.has(pathname) &&
    !hasSessionCookie(request)
  ) {
    return secureAdmin(
      NextResponse.redirect(new URL(ADMIN_LOGIN_PATH, request.url), 307),
      nonce
    );
  }

  const headers = new Headers(request.headers);
  headers.set("x-portfolio-csp-nonce", nonce);
  headers.set("x-portfolio-pathname", pathname);
  // Next reads the nonce for its own inline bootstrap scripts from the request
  // CSP header, so the policy has to travel inward as well as outward.
  headers.set("content-security-policy", adminSecurityPolicy(nonce));
  return secureAdmin(NextResponse.next({ request: { headers } }), nonce);
}

interface ProxyDependencies {
  readonly dataSource?: "database" | "legacy";
  readonly checkAvailability?: (
    pathname: string
  ) => Promise<PublicRouteAvailability>;
}

/** Locale-prefixed URLs are canonical; root has no independently indexable page. */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  return proxyWithDependencies(request);
}

export async function proxyWithDependencies(
  request: NextRequest,
  dependencies: ProxyDependencies = {}
): Promise<NextResponse> {
  const nonce = createNonce();
  // `skipTrailingSlashRedirect` hands us the raw path, so canonicalizing it is
  // this function's job now. Doing it here rather than letting Next do it is
  // what keeps `/projects/` to a single hop instead of two.
  const rawPath = request.nextUrl.pathname;
  const pathname =
    rawPath.length > 1 && rawPath.endsWith("/")
      ? rawPath.replace(/\/+$/, "")
      : rawPath;
  // Before locale negotiation: the admin panel is English-only in this release
  // (PRODUCT_SPEC.md §7) and carries no locale prefix, so none of the public
  // routing below applies to it.
  if (isAdminPath(pathname)) {
    if (pathname !== rawPath) {
      return secureAdmin(
        NextResponse.redirect(new URL(pathname, request.url), 308),
        nonce
      );
    }
    return handleAdminRequest(request, pathname, nonce);
  }

  const redirectPath =
    legacyLocaleRedirect(pathname) ?? (pathname === rawPath ? null : pathname);
  if (redirectPath) {
    const response = secure(
      NextResponse.redirect(new URL(redirectPath, request.url), 308),
      nonce
    );
    return response;
  }

  // Next's existing locale route remains the internal implementation detail,
  // but visitors see an English-only portfolio at unprefixed URLs. Only the
  // blog exposes a language in its public URL.
  const internalPathname =
    pathname === "/"
      ? "/en"
      : pathname === "/projects"
        ? `/en${pathname}`
        : pathname;
  const locale = internalPathname.split("/")[1];
  const dataSource =
    dependencies.dataSource ??
    parsePortfolioDataSource(process.env.PORTFOLIO_DATA_SOURCE);
  const isDocumentRead = request.method === "GET" || request.method === "HEAD";
  if (dataSource === "database" && isLocale(locale) && isDocumentRead) {
    const availability = await (
      dependencies.checkAvailability ?? checkDefaultPublicRouteAvailability
    )(internalPathname);
    if (availability === "unavailable") {
      return createUnavailableResponse(locale, nonce);
    }
    if (availability === "not-found") {
      return createNotFoundResponse(locale, nonce);
    }
  }

  const headers = new Headers(request.headers);
  headers.set("x-portfolio-locale", locale === "fa" ? "fa" : "en");
  headers.set("x-portfolio-csp-nonce", nonce);
  headers.set("x-portfolio-pathname", pathname);
  const response = secure(
    internalPathname === pathname
      ? NextResponse.next({ request: { headers } })
      : NextResponse.rewrite(new URL(internalPathname, request.url), {
          request: { headers },
        }),
    nonce
  );
  if (PUBLIC_DISCOVERY_PATH.test(pathname)) {
    // Deleted rather than replaced: the route handler already sent the policy
    // it wants, and a second value here would be the one that wins.
    response.headers.delete("Cache-Control");
  }
  return response;
}

function createUnavailableResponse(
  locale: "en" | "fa",
  nonce: string
): NextResponse {
  const definition = getLocaleDefinition(locale);
  const message = escapeHtml(getMessages(locale).common.siteUnavailable);
  const response = new NextResponse(
    `<!doctype html><html lang="${definition.bcp47}" dir="${definition.direction}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${message}</title><style>html{color-scheme:dark}body{margin:0;background:#101010;color:#f5f5f5;font-family:system-ui,sans-serif}main{box-sizing:border-box;max-width:60rem;margin:5rem auto;padding:2rem;border:1px solid #777;text-align:center}h1{font-size:1.5rem}</style></head><body><main role="alert"><h1>${message}</h1></main></body></html>`,
    {
      status: 503,
      headers: {
        "Content-Language": definition.bcp47,
        "Content-Type": "text/html; charset=utf-8",
        "Retry-After": "60",
      },
    }
  );
  return secure(response, nonce);
}

function createNotFoundResponse(
  locale: "en" | "fa",
  nonce: string
): NextResponse {
  const definition = getLocaleDefinition(locale);
  const messages = getMessages(locale);
  const title = escapeHtml(messages.notFound.title);
  const response = new NextResponse(
    `<!doctype html><html lang="${definition.bcp47}" dir="${definition.direction}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title}</title></head><body><main role="main"><h1>${title}</h1><p>${escapeHtml(messages.notFound.description)}</p></main></body></html>`,
    {
      status: 404,
      headers: {
        "Content-Language": definition.bcp47,
        "Content-Type": "text/html; charset=utf-8",
      },
    }
  );
  return secure(response, nonce);
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] as string
  );
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
