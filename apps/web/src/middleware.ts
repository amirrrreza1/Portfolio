import { NextResponse, type NextRequest } from "next/server";

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

/** Locale-prefixed URLs are canonical; root has no independently indexable page. */
export function middleware(request: NextRequest): NextResponse {
  const nonce = createNonce();
  if (request.nextUrl.pathname === "/") {
    return secure(
      NextResponse.redirect(new URL("/en", request.url), 308),
      nonce
    );
  }
  const locale = request.nextUrl.pathname.split("/")[1];
  const headers = new Headers(request.headers);
  headers.set("x-portfolio-locale", locale === "fa" ? "fa" : "en");
  headers.set("x-portfolio-csp-nonce", nonce);
  const response = NextResponse.next({ request: { headers } });
  return secure(response, nonce);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
