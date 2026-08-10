import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import argon2 from "argon2";

import {
  SESSION_ABSOLUTE_TIMEOUT_HOURS,
  SESSION_IDLE_TIMEOUT_MINUTES,
  SESSION_TOKEN_BYTES,
} from "@portfolio/contracts/auth";

export interface SessionSecrets {
  readonly sessionSecret: string;
  readonly csrfSecret: string;
}

/** OWASP-aligned memory-hard profile; changes require an explicit migration. */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
} as const;

export async function hashPassword(password: string): Promise<string> {
  if (password.length === 0 || password.length > 256) {
    throw new Error("Password is outside the allowed length.");
  }
  return argon2.hash(password.normalize("NFC"), ARGON2_OPTIONS);
}

/** Invalid encodings deliberately return false rather than expose parser detail. */
export async function verifyPasswordHash(
  password: string,
  encodedHash: string
): Promise<boolean> {
  if (password.length === 0 || password.length > 256) return false;
  try {
    return await argon2.verify(encodedHash, password.normalize("NFC"));
  } catch {
    return false;
  }
}

export interface PasswordLoginAccount {
  readonly userId: string;
  readonly passwordHash: string;
  readonly status: "ACTIVE" | "LOCKED" | "DISABLED";
}

export interface PasswordLoginStore {
  findByEmail(email: string): Promise<PasswordLoginAccount | null>;
  createSession(
    input: Omit<IssuedSession, "sessionToken" | "csrfToken"> & {
      readonly userId: string;
    }
  ): Promise<void>;
  recordSuccessfulPasswordLogin(userId: string): Promise<void>;
}

/**
 * Password step of a two-factor login. Both absent and invalid accounts verify
 * an Argon2 hash before returning the same failure result, preventing a cheap
 * timing oracle for owner-account discovery.
 */
export class PasswordLoginService {
  constructor(
    private readonly store: PasswordLoginStore,
    private readonly secrets: SessionSecrets,
    private readonly dummyPasswordHash: string
  ) {}

  async authenticate(input: {
    readonly email: string;
    readonly password: string;
    readonly now?: Date;
  }): Promise<
    | { readonly outcome: "FAILED" }
    | { readonly outcome: "PASSWORD_VERIFIED"; readonly session: IssuedSession }
  > {
    const account = await this.store.findByEmail(input.email);
    const verified = await verifyPasswordHash(
      input.password,
      account?.passwordHash ?? this.dummyPasswordHash
    );
    if (!verified || account?.status !== "ACTIVE") return { outcome: "FAILED" };

    const session = issueSession(this.secrets, input.now);
    await this.store.createSession({
      userId: account.userId,
      tokenHash: session.tokenHash,
      csrfBindingHash: session.csrfBindingHash,
      expiresAt: session.expiresAt,
      idleExpiresAt: session.idleExpiresAt,
    });
    await this.store.recordSuccessfulPasswordLogin(account.userId);
    return { outcome: "PASSWORD_VERIFIED", session };
  }
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

export function isSessionUsable(input: {
  readonly expiresAt: Date;
  readonly lastSeenAt: Date;
  readonly revokedAt: Date | null;
  readonly now?: Date;
}): boolean {
  const now = input.now ?? new Date();
  return (
    input.revokedAt === null &&
    input.expiresAt > now &&
    input.lastSeenAt.getTime() + SESSION_IDLE_TIMEOUT_MINUTES * 60_000 >
      now.getTime()
  );
}

/**
 * Validates all browser-mutation defenses together. `same-site` is not enough:
 * a compromised sibling subdomain is still cross-origin, so only same-origin
 * requests are accepted for cookie-authenticated changes.
 */
export function authorizeCookieMutation(input: {
  readonly origin: string | undefined;
  readonly expectedOrigin: string;
  readonly secFetchSite: string | undefined;
  readonly csrfToken: string | undefined;
  readonly csrfSecret: string;
  readonly csrfBindingHash: string;
  readonly session: {
    readonly expiresAt: Date;
    readonly lastSeenAt: Date;
    readonly revokedAt: Date | null;
  };
  readonly now?: Date;
}): boolean {
  if (
    !isSessionUsable(
      input.now === undefined
        ? input.session
        : { ...input.session, now: input.now }
    )
  )
    return false;
  if (
    input.origin !== input.expectedOrigin ||
    input.secFetchSite !== "same-origin"
  ) {
    return false;
  }
  return (
    input.csrfToken !== undefined &&
    verifyCsrfToken(input.csrfSecret, input.csrfToken, input.csrfBindingHash)
  );
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
