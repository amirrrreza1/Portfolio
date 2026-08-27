/**
 * Where the web server reaches the API.
 *
 * Two different addresses exist for the same API and confusing them is a
 * security bug, not a configuration detail:
 *
 * - The **browser** always uses `NEXT_PUBLIC_API_BASE_URL` (`/api/v1`), a
 *   same-origin path that `next.config.ts` rewrites to the API. Same-origin is
 *   what makes `SameSite=Strict` session cookies reachable at all, and it is
 *   why the API's origin never appears in a client bundle.
 * - The **server** uses `API_INTERNAL_ORIGIN`, an absolute origin that is
 *   typically not routable from outside the deployment network.
 *
 * This module owns the second one so that the parsing rules live in exactly one
 * place. A credential embedded in the origin, or a path appended to it, would
 * silently change what every server-side request talks to.
 */

export function parseApiOrigin(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("API_INTERNAL_ORIGIN must be an absolute URL.");
  }

  if (
    !(["http:", "https:"] as const).includes(url.protocol as "http:" | "https:")
  ) {
    throw new Error("API_INTERNAL_ORIGIN must use http or https.");
  }
  if (url.username || url.password) {
    throw new Error("API_INTERNAL_ORIGIN must not contain credentials.");
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("API_INTERNAL_ORIGIN must contain only an origin.");
  }
  return url;
}

/**
 * Throws rather than defaulting to localhost.
 *
 * An admin route that quietly falls back to a development address would answer
 * "not signed in" in production for a reason no log explains, and the operator
 * would be debugging the login form instead of the missing variable.
 */
export function requireApiOrigin(): URL {
  const raw = process.env.API_INTERNAL_ORIGIN?.trim();
  if (!raw) {
    throw new Error("API_INTERNAL_ORIGIN is required.");
  }
  return parseApiOrigin(raw);
}
