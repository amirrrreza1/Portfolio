import { NextResponse, type NextRequest } from "next/server";
import { getLocaleDefinition, isLocale } from "@portfolio/contracts/common";

import { legacyLocaleRedirect } from "./i18n/routing";
import { getMessages } from "./i18n/messages";
import {
  LOCALE_COOKIE_NAME,
  negotiateRootLocale,
} from "./i18n/locale-preference";
import { parsePortfolioDataSource } from "./server/portfolio-data-source";
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
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "form-action 'self'",
  ].join("; ");
}

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
  const rootLocale =
    pathname === "/"
      ? negotiateRootLocale(
          request.cookies.get(LOCALE_COOKIE_NAME)?.value,
          request.headers.get("accept-language")
        )
      : undefined;
  const redirectPath =
    legacyLocaleRedirect(pathname, rootLocale) ??
    (pathname === rawPath ? null : pathname);
  if (redirectPath) {
    const response = secure(
      NextResponse.redirect(new URL(redirectPath, request.url), 308),
      nonce
    );
    if (pathname === "/") {
      response.headers.set("Vary", "Accept-Language, Cookie");
    }
    return response;
  }

  const locale = pathname.split("/")[1];
  const dataSource =
    dependencies.dataSource ??
    parsePortfolioDataSource(process.env.PORTFOLIO_DATA_SOURCE);
  const isDocumentRead = request.method === "GET" || request.method === "HEAD";
  if (dataSource === "database" && isLocale(locale) && isDocumentRead) {
    const availability = await (
      dependencies.checkAvailability ?? checkDefaultPublicRouteAvailability
    )(pathname);
    if (availability === "unavailable") {
      return createUnavailableResponse(locale, nonce);
    }
  }

  const headers = new Headers(request.headers);
  headers.set("x-portfolio-locale", locale === "fa" ? "fa" : "en");
  headers.set("x-portfolio-csp-nonce", nonce);
  headers.set("x-portfolio-pathname", pathname);
  const response = NextResponse.next({ request: { headers } });
  return secure(response, nonce);
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
