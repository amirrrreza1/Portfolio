import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import {
  SESSION_ABSOLUTE_TIMEOUT_HOURS,
  SESSION_IDLE_TIMEOUT_MINUTES,
  SESSION_TOKEN_BYTES,
} from "@portfolio/contracts/auth";

export interface SessionSecrets {
  readonly sessionSecret: string;
  readonly csrfSecret: string;
}

export interface IssuedSession {
  /** Cookie-only values. They must never appear in a JSON response or database row. */
  readonly sessionToken: string;
  readonly csrfToken: string;
  readonly tokenHash: string;
  readonly csrfBindingHash: string;
  readonly expiresAt: Date;
  readonly idleExpiresAt: Date;
}

export function issueSession(
  secrets: SessionSecrets,
  now = new Date()
): IssuedSession {
  assertSecrets(secrets);
  const sessionToken = randomBytes(SESSION_TOKEN_BYTES).toString("base64url");
  const csrfToken = randomBytes(SESSION_TOKEN_BYTES).toString("base64url");
  return {
    sessionToken,
    csrfToken,
    tokenHash: keyedHash(secrets.sessionSecret, sessionToken),
    csrfBindingHash: keyedHash(secrets.csrfSecret, csrfToken),
    expiresAt: new Date(
      now.getTime() + SESSION_ABSOLUTE_TIMEOUT_HOURS * 3_600_000
    ),
    idleExpiresAt: new Date(
      now.getTime() + SESSION_IDLE_TIMEOUT_MINUTES * 60_000
    ),
  };
}

export function verifySessionToken(
  secret: string,
  token: string,
  storedHash: string
): boolean {
  return equalHash(keyedHash(secret, token), storedHash);
}

export function verifyCsrfToken(
  secret: string,
  token: string,
  storedBindingHash: string
): boolean {
  return equalHash(keyedHash(secret, token), storedBindingHash);
}

function assertSecrets(secrets: SessionSecrets): void {
  if (
    secrets.sessionSecret.length < 32 ||
    secrets.csrfSecret.length < 32 ||
    secrets.sessionSecret === secrets.csrfSecret
  ) {
    throw new Error(
      "Independent session and CSRF secrets of at least 32 characters are required."
    );
  }
}

function keyedHash(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function equalHash(expected: string, received: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(received)) return false;
  return timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(received, "hex")
  );
}
