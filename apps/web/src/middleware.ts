import { NextResponse, type NextRequest } from "next/server";

/** Locale-prefixed URLs are canonical; root has no independently indexable page. */
export function middleware(request: NextRequest): NextResponse {
  return NextResponse.redirect(new URL("/en", request.url), 308);
}

export const config = { matcher: ["/"] };
