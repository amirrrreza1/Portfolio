import { NextResponse, type NextRequest } from "next/server";

/** Locale-prefixed URLs are canonical; root has no independently indexable page. */
export function middleware(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname === "/") {
    return NextResponse.redirect(new URL("/en", request.url), 308);
  }
  const locale = request.nextUrl.pathname.split("/")[1];
  const headers = new Headers(request.headers);
  headers.set("x-portfolio-locale", locale === "fa" ? "fa" : "en");
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/", "/:locale(en|fa)"] };
