import {
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  sessionActorSchema,
  sessionSummarySchema,
  type SessionActor,
  type SessionSummary,
} from "@portfolio/contracts/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { z } from "zod";

import { ADMIN_LOGIN_PATH } from "./admin-routes";
import { requireApiOrigin } from "./api-origin";

/**
 * The server half of the admin boundary.
 *
 * The rule this module exists to enforce: **the admin shell never decides for
 * itself whether someone is signed in.** It asks the API, on every render, and
 * the API re-reads the session record — expiry, revocation, and account status
 * included. A client-side check, a decoded cookie, or a cached answer would all
 * turn "the owner revoked that laptop's session" into "the laptop keeps working
 * until it reloads something".
 *
 * `GET /auth/session` is the single source of that answer. It is also why the
 * shell has no session state of its own to get stale.
 */

/** The session cookie is `HttpOnly`; only the server can forward it. */
const FORWARDED_COOKIES = [SESSION_COOKIE_NAME, CSRF_COOKIE_NAME] as const;

/**
 * `__Host-` is only legal on a `Secure` cookie, so plain-HTTP development uses
 * the bare name. The API does the same fallback when it sets them; this is the
 * reading half of that same rule.
 */
function candidateNames(name: string): readonly string[] {
  return [name, name.replace(/^__Host-/, "")];
}

const DEFAULT_TIMEOUT_MS = 2_000;

const actorEnvelopeSchema = z.object({ data: sessionActorSchema });
const sessionsEnvelopeSchema = z.object({
  data: z.array(sessionSummarySchema),
});

async function forwardedCookieHeader(): Promise<string | null> {
  const jar = await cookies();
  const parts: string[] = [];
  for (const name of FORWARDED_COOKIES) {
    for (const candidate of candidateNames(name)) {
      const value = jar.get(candidate)?.value;
      if (value !== undefined) {
        parts.push(`${candidate}=${encodeURIComponent(value)}`);
      }
    }
  }
  return parts.length === 0 ? null : parts.join("; ");
}

/**
 * One authenticated read against the API, as this visitor.
 *
 * Returns `null` for every "you are not signed in" answer and throws for
 * everything else, because those two need different handling: the first
 * redirects to the login page, and the second must not be mistaken for it. An
 * API that is merely *down* answering as "signed out" would send an owner to a
 * login form that cannot possibly work, and hide the outage while doing it.
 */
async function authenticatedRead<T>(
  path: string,
  schema: z.ZodType<T>
): Promise<T | null> {
  const cookieHeader = await forwardedCookieHeader();
  // No cookie at all is a definitive "signed out" and needs no round trip.
  if (cookieHeader === null) return null;

  const origin = requireApiOrigin();
  const response = await fetch(new URL(`/api/v1${path}`, origin), {
    headers: { cookie: cookieHeader, accept: "application/json" },
    // An authenticated read must never be served from, or written to, any
    // cache: the response is specific to one session token.
    cache: "no-store",
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) {
    throw new AdminApiUnavailableError(response.status);
  }

  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new AdminApiUnavailableError(response.status);
  }
  return parsed.data;
}

export class AdminApiUnavailableError extends Error {
  public constructor(public readonly status: number) {
    super(`The admin API answered ${status}.`);
    this.name = "AdminApiUnavailableError";
  }
}

/**
 * The signed-in actor, or `null`. Never throws for "signed out".
 *
 * `cache` deduplicates within one render pass, so the layout and the page it
 * wraps can each ask independently — which is the point. Every admin surface
 * checks for itself rather than trusting an ancestor to have done it, and the
 * memo is what makes that cost one round trip instead of one per component.
 * The memo lives for a single request and cannot leak one visitor's answer to
 * another.
 */
export async function fetchAdminActor(): Promise<SessionActor | null> {
  const envelope = await authenticatedRead(
    "/auth/session",
    actorEnvelopeSchema
  );
  return envelope?.data ?? null;
}

export const readAdminActor = cache(fetchAdminActor);

/**
 * The guard every authenticated admin surface calls first.
 *
 * It redirects rather than rendering a "please sign in" state, so there is no
 * code path in which an admin component renders at all without a verified
 * session behind it. `redirect` throws, which is what makes that structural
 * instead of conventional: a caller cannot forget to return early.
 */
export async function requireAdminActor(): Promise<SessionActor> {
  const actor = await readAdminActor();
  if (actor === null) redirect(ADMIN_LOGIN_PATH);
  return actor;
}

/**
 * One preview render, read as this visitor.
 *
 * The preview is fetched on the server rather than in the browser so the page
 * can set its own `noindex` headers and so unpublished prose never travels
 * through a client-side fetch that some extension or shared cache could see.
 * A missing or expired token answers `null`, which the route turns into a
 * 404 — the same answer as a token that never existed, because distinguishing
 * them would confirm that a guessed token was once real.
 */
export async function readAdminPreview(token: string): Promise<string | null> {
  const envelope = await authenticatedRead(
    `/admin/blog/previews/${encodeURIComponent(token)}`,
    z.object({ data: z.object({ html: z.string() }) })
  );
  return envelope?.data.html ?? null;
}

/** This user's sessions, for the ADMIN-002 management list. */
export async function listAdminSessions(): Promise<readonly SessionSummary[]> {
  const envelope = await authenticatedRead(
    "/auth/sessions",
    sessionsEnvelopeSchema
  );
  return envelope?.data ?? [];
}
