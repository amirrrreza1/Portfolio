/**
 * The admin URL space, in one place.
 *
 * The proxy, the root layout, and the session guard all have to agree on what
 * counts as an admin path. When that predicate is written three times it
 * eventually differs in one of them, and the one that differs is the one that
 * renders an admin page under the public policy.
 */

export const ADMIN_PATH_PREFIX = "/admin";

/** Where an unauthenticated admin request is sent. */
export const ADMIN_LOGIN_PATH = "/admin/login";

/** Signing in with a recovery code, when the passkey is gone. */
export const ADMIN_RECOVERY_PATH = "/admin/recovery";

/**
 * The two admin routes a signed-out visitor is allowed to reach.
 *
 * Both are sign-in surfaces, so gating them on a session would lock out the
 * only person who could ever pass the gate.
 */
export const UNAUTHENTICATED_ADMIN_PATHS: ReadonlySet<string> = new Set([
  ADMIN_LOGIN_PATH,
  ADMIN_RECOVERY_PATH,
]);

export function isAdminPath(pathname: string): boolean {
  return (
    pathname === ADMIN_PATH_PREFIX ||
    pathname.startsWith(`${ADMIN_PATH_PREFIX}/`)
  );
}
