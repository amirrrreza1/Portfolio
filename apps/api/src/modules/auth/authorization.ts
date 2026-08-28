import type { Role } from "@portfolio/contracts/auth";

import type { AuthenticatedRequest } from "./auth.service.js";

/**
 * The authorization policy, from API_SPEC §9.
 *
 * Deny by default, in the strongest sense: `PERMISSIONS` is an allowlist and
 * `can()` answers false for anything not in it, so adding a permission is an
 * edit to this table and forgetting to add one fails closed. A policy built
 * the other way — deny-list, or "check the role in the controller" — fails
 * open the first time someone adds an endpoint and forgets.
 *
 * **`EDITOR` is defined but not grantable.** DECISIONS.md records the v1
 * editor-permission matrix as an owner decision that has not been made, and
 * §9's editor column still contains "configurable" and "no by default" — which
 * are questions, not answers. Encoding a guess here would turn an open
 * decision into shipped behaviour that nobody chose. So the role exists in the
 * type system, its unambiguous rows are recorded below, and
 * `isRoleAssignable()` refuses to hand it out until the ADR lands. Provisioning
 * stays owner-only in the meantime, exactly as that decision says it must.
 */

export const PERMISSIONS = [
  "content.draft.read",
  "content.draft.write",
  "content.publish",
  "content.import",
  "settings.manage",
  "appearance.write",
  "media.read",
  "media.upload",
  "media.manage",
  "contact.read",
  "revision.restore",
  "users.manage",
  "audit.read",
  "content.delete",
  "session.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Permissions that additionally require a recent authentication.
 *
 * SECURITY.md §3: password, passkey, recovery, role, permanent-delete, and
 * session-wide actions. A long-lived session left open on a laptop must not be
 * enough for any of them.
 */
export const RECENT_AUTH_PERMISSIONS: ReadonlySet<Permission> = new Set([
  "users.manage",
  "content.delete",
  "session.manage",
]);

/**
 * The grant table. Owner holds everything §9 marks `yes`.
 *
 * The editor set contains only the rows §9 states without qualification.
 * Anything the matrix leaves conditional is absent, which — given deny by
 * default — means "no" until the ADR says otherwise. That is the safe
 * direction for an undecided permission.
 */
const GRANTS: { readonly [K in Role]: ReadonlySet<Permission> } = {
  OWNER: new Set(PERMISSIONS),
  EDITOR: new Set<Permission>([
    "content.draft.read",
    "content.draft.write",
    "media.read",
    "media.upload",
  ]),
};

export type AuthorizationOutcome =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: "forbidden" }
  | { readonly allowed: false; readonly reason: "recent-auth-required" };

/**
 * The single decision point.
 *
 * Takes the whole authenticated request rather than a role string, so the
 * recent-auth rule cannot be checked in one place and forgotten in another.
 */
export function authorize(
  request: AuthenticatedRequest,
  permission: Permission
): AuthorizationOutcome {
  if (request.user.status !== "ACTIVE") return notAllowed("forbidden");
  if (!GRANTS[request.user.role]?.has(permission)) {
    return notAllowed("forbidden");
  }
  if (
    RECENT_AUTH_PERMISSIONS.has(permission) &&
    !request.recentlyAuthenticated
  ) {
    return notAllowed("recent-auth-required");
  }
  return { allowed: true };
}

export function can(
  request: AuthenticatedRequest,
  permission: Permission
): boolean {
  return authorize(request, permission).allowed;
}

/**
 * Whether a role may currently be granted to a user.
 *
 * Called by provisioning and by any future role-change path. It is a function
 * rather than a constant so the refusal has somewhere to be explained, and so
 * removing the restriction is a one-line change in one place when the ADR
 * lands.
 */
export function isRoleAssignable(role: Role): boolean {
  return role === "OWNER";
}

/**
 * Object-level ownership check.
 *
 * SECURITY.md §5 requires that an editor cannot reach a forbidden resource
 * through a guessed ID. Route-level role checks cannot express that — the role
 * is right and the object is not — so this is enforced beside the data, and
 * every resource read that is scoped to an actor must call it.
 */
export function ownsResource(
  request: AuthenticatedRequest,
  resourceOwnerId: string | null
): boolean {
  if (request.user.role === "OWNER") return true;
  return resourceOwnerId !== null && resourceOwnerId === request.user.userId;
}

function notAllowed(
  reason: "forbidden" | "recent-auth-required"
): AuthorizationOutcome {
  return { allowed: false, reason };
}
