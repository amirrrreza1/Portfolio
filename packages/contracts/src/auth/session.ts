import { z } from "zod";

import { sessionIdSchema, userIdSchema } from "../common/ids.js";
import { isoTimestampSchema } from "../common/values.js";

/**
 * Session, CSRF, and WebAuthn contracts, per
 * [SECURITY.md](../../../../docs/SECURITY.md) §3–§5.
 *
 * Nothing here carries a session token. The token exists in the cookie and as
 * a hash in the database, and never in a response body — putting it in JSON
 * would make it readable by any script that can reach the response, which is
 * precisely what `HttpOnly` exists to prevent.
 */

/**
 * `__Host-` prefix, which a browser enforces: the cookie must be `Secure`,
 * have `Path=/`, and carry no `Domain`. A subdomain therefore cannot set it,
 * which closes subdomain-takeover session fixation without relying on
 * server-side discipline.
 */
export const SESSION_COOKIE_NAME = "__Host-portfolio_session";
export const CSRF_COOKIE_NAME = "__Host-portfolio_csrf";

/** 256 bits, base64url-encoded. */
export const SESSION_TOKEN_BYTES = 32;

export const SESSION_IDLE_TIMEOUT_MINUTES = 30;
export const SESSION_ABSOLUTE_TIMEOUT_HOURS = 12;

/**
 * How long a re-authentication counts for.
 *
 * Password, passkey, recovery, role, permanent-delete, and session-wide
 * actions require a recent authentication window (SECURITY.md §3). Five
 * minutes is short enough that an unattended session cannot be used for a
 * privileged action, and long enough to complete one.
 */
export const RECENT_AUTH_WINDOW_MINUTES = 5;

export const roleSchema = z.enum(["OWNER", "EDITOR"]);
export type Role = z.infer<typeof roleSchema>;

export const userStatusSchema = z.enum(["ACTIVE", "LOCKED", "DISABLED"]);
export type UserStatus = z.infer<typeof userStatusSchema>;

/**
 * What `GET /auth/session` returns.
 *
 * The minimum the admin shell needs to render. No email beyond what the actor
 * already knows about themselves, no session token, no permissions list that
 * the client could be tempted to treat as authoritative — authorization is
 * decided server-side on every request, and shipping a permission set invites
 * a client that checks it instead.
 */
export const sessionActorSchema = z.object({
  userId: userIdSchema,
  displayName: z.string().min(1),
  role: roleSchema,
  /**
   * True while inside the recent-auth window. The UI uses it to decide whether
   * to prompt before a privileged action; the server re-checks regardless.
   */
  recentlyAuthenticated: z.boolean(),
  expiresAt: isoTimestampSchema,
});

export type SessionActor = z.infer<typeof sessionActorSchema>;

/**
 * A session summary for the management list.
 *
 * Raw tokens, precise IP addresses, and full user-agent strings are never
 * displayed (SECURITY.md §4). What is shown is enough to recognize "that is my
 * laptop" or "that is not me", and no more — a session list that reports exact
 * IPs turns a compromised admin account into a location history.
 */
export const sessionSummarySchema = z.object({
  id: sessionIdSchema,
  /** Coarse label such as "Firefox on Windows", derived server-side. */
  client: z.string().min(1),
  createdAt: isoTimestampSchema,
  lastSeenAt: isoTimestampSchema,
  expiresAt: isoTimestampSchema,
  /** Whether this is the session making the request. */
  current: z.boolean(),
});

export type SessionSummary = z.infer<typeof sessionSummarySchema>;

/** Header carrying the CSRF token. Compared against the session binding. */
export const CSRF_HEADER_NAME = "x-csrf-token";

export const csrfTokenSchema = z
  .string()
  .min(32)
  .max(256)
  .regex(/^[A-Za-z0-9_-]+$/, "Must be a base64url token.");

/**
 * WebAuthn assertion, forwarded to the verification library.
 *
 * Only the shape is validated here. The security properties — challenge
 * freshness, origin and RP-ID binding, single use, signature verification, and
 * the counter check — are all server-side and cannot be expressed in a request
 * schema. Validating the shape stops malformed input from reaching the
 * verifier; it proves nothing about authenticity.
 */
export const webAuthnAssertionSchema = z
  .object({
    id: z.string().min(1),
    rawId: z.string().min(1),
    type: z.literal("public-key"),
    response: z.object({
      clientDataJSON: z.string().min(1),
      authenticatorData: z.string().min(1),
      signature: z.string().min(1),
      userHandle: z.string().nullable().optional(),
    }),
    clientExtensionResults: z.record(z.string(), z.unknown()).optional(),
    authenticatorAttachment: z
      .enum(["platform", "cross-platform"])
      .nullable()
      .optional(),
  })
  .strict();

export type WebAuthnAssertion = z.infer<typeof webAuthnAssertionSchema>;

export const webAuthnRegistrationSchema = z
  .object({
    id: z.string().min(1),
    rawId: z.string().min(1),
    type: z.literal("public-key"),
    response: z.object({
      clientDataJSON: z.string().min(1),
      attestationObject: z.string().min(1),
      transports: z.array(z.string()).optional(),
    }),
    clientExtensionResults: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type WebAuthnRegistration = z.infer<typeof webAuthnRegistrationSchema>;

/** Verifying an assertion for an in-flight login or re-auth flow. */
export const webAuthnVerifyRequestSchema = z
  .object({
    challengeId: z.string().min(1),
    assertion: webAuthnAssertionSchema,
  })
  .strict();

export type WebAuthnVerifyRequest = z.infer<typeof webAuthnVerifyRequestSchema>;

export const credentialLabelSchema = z.string().trim().min(1).max(64);

export const enrollCredentialSchema = z
  .object({
    challengeId: z.string().min(1),
    label: credentialLabelSchema,
    registration: webAuthnRegistrationSchema,
  })
  .strict();

export type EnrollCredential = z.infer<typeof enrollCredentialSchema>;

/**
 * Reasons a session ended, recorded for the audit trail.
 *
 * `SECURITY_CHANGE` is separate from `REVOKED` because a password or passkey
 * change revokes every other session, and an owner reviewing the audit log
 * needs to tell that apart from a deliberate single revocation.
 */
export const sessionRevocationReasonSchema = z.enum([
  "LOGOUT",
  "REVOKED",
  "EXPIRED",
  "SECURITY_CHANGE",
  "ACCOUNT_DISABLED",
  "SUSPICIOUS",
]);

export type SessionRevocationReason = z.infer<
  typeof sessionRevocationReasonSchema
>;
