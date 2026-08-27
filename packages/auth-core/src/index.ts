import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import argon2 from "argon2";

import {
  RECOVERY_CODE_GROUP_LENGTH,
  RECOVERY_CODE_GROUPS,
  SESSION_ABSOLUTE_TIMEOUT_HOURS,
  SESSION_IDLE_TIMEOUT_MINUTES,
  SESSION_TOKEN_BYTES,
} from "@portfolio/contracts/auth";

export interface SessionSecrets {
  readonly sessionSecret: string;
  readonly csrfSecret: string;
}

const RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export interface RecoveryCodeIssue {
  readonly displayCode: string;
  readonly hash: string;
}

export type WebAuthnChallengePurpose = "LOGIN" | "ENROLL" | "REAUTH";

export interface WebAuthnChallengeRecord {
  readonly id: string;
  readonly challenge: string;
  readonly purpose: WebAuthnChallengePurpose;
  readonly userId: string | null;
  readonly expiresAt: Date;
}

export interface WebAuthnChallengeStore {
  create(record: WebAuthnChallengeRecord): Promise<void>;
  /**
   * Reads without removing, for the step that only needs to *offer* the
   * challenge. `POST /auth/webauthn/options` hands the challenge to the
   * browser; consuming it there would leave nothing for the verify step to
   * check against, and re-issuing one would break the binding between the
   * password step and the assertion.
   */
  peek(id: string): Promise<WebAuthnChallengeRecord | null>;
  /** Atomically retrieves and removes the record, so a response cannot replay. */
  consume(id: string): Promise<WebAuthnChallengeRecord | null>;
}

export async function issueWebAuthnChallenge(input: {
  readonly store: WebAuthnChallengeStore;
  readonly purpose: WebAuthnChallengePurpose;
  readonly userId: string | null;
  readonly now?: Date;
}): Promise<WebAuthnChallengeRecord> {
  const now = input.now ?? new Date();
  const record: WebAuthnChallengeRecord = {
    id: randomUUID(),
    challenge: randomBytes(32).toString("base64url"),
    purpose: input.purpose,
    userId: input.userId,
    expiresAt: new Date(now.getTime() + 5 * 60_000),
  };
  await input.store.create(record);
  return record;
}

/** Reads a live challenge without spending it. */
export async function peekWebAuthnChallenge(input: {
  readonly store: WebAuthnChallengeStore;
  readonly id: string;
  readonly purpose: WebAuthnChallengePurpose;
  readonly now?: Date;
}): Promise<WebAuthnChallengeRecord | null> {
  const record = await input.store.peek(input.id);
  const now = input.now ?? new Date();
  if (!record || record.purpose !== input.purpose || record.expiresAt <= now)
    return null;
  return record;
}

export async function consumeWebAuthnChallenge(input: {
  readonly store: WebAuthnChallengeStore;
  readonly id: string;
  readonly purpose: WebAuthnChallengePurpose;
  readonly now?: Date;
}): Promise<WebAuthnChallengeRecord | null> {
  const record = await input.store.consume(input.id);
  const now = input.now ?? new Date();
  if (!record || record.purpose !== input.purpose || record.expiresAt <= now)
    return null;
  return record;
}

/** Generates codes once; only their keyed hashes belong in `RecoveryCode`. */
export function issueRecoveryCodes(
  recoverySecret: string,
  count = 10
): readonly RecoveryCodeIssue[] {
  if (
    recoverySecret.length < 32 ||
    !Number.isSafeInteger(count) ||
    count < 1 ||
    count > 20
  ) {
    throw new Error("A recovery secret and a bounded code count are required.");
  }
  const codes = new Set<string>();
  while (codes.size < count) {
    let raw = "";
    for (const byte of randomBytes(
      RECOVERY_CODE_GROUPS * RECOVERY_CODE_GROUP_LENGTH
    )) {
      raw += RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length];
    }
    codes.add(raw);
  }
  return [...codes].map((raw) => ({
    displayCode: raw.match(/.{1,5}/g)?.join("-") ?? raw,
    hash: keyedHash(recoverySecret, raw),
  }));
}

/**
 * The stored hash for a supplied code, or null when the code is malformed.
 *
 * Exported because a lookup needs the same hash `issueRecoveryCodes` wrote,
 * and two implementations of that would be one implementation and one bug.
 */
export function recoveryCodeHash(
  recoverySecret: string,
  suppliedCode: string
): string | null {
  const normalized = suppliedCode.toLowerCase().replace(/[\s-]/g, "");
  if (!/^[a-z0-9]{20}$/.test(normalized)) return null;
  return keyedHash(recoverySecret, normalized);
}

export function verifyRecoveryCode(
  recoverySecret: string,
  suppliedCode: string,
  storedHash: string
): boolean {
  const hash = recoveryCodeHash(recoverySecret, suppliedCode);
  return hash === null ? false : equalHash(hash, storedHash);
}

/** The stored hash for a session token. Same rule as recovery codes. */
export function sessionTokenHash(sessionSecret: string, token: string): string {
  return keyedHash(sessionSecret, token);
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
  recordSuccessfulPasswordLogin(userId: string): Promise<void>;
}

/**
 * The password step of a two-factor login, and *only* that step.
 *
 * It deliberately issues no session. An earlier revision created one here, so
 * a correct password alone produced a usable session cookie — a single-factor
 * session for a flow SECURITY.md §3 requires to complete WebAuthn before it
 * succeeds. The session is issued by the assertion step instead.
 *
 * Both absent and invalid accounts verify an Argon2 hash before returning the
 * same failure result, so the response is not a cheap timing oracle for owner
 * account discovery.
 */
export class PasswordLoginService {
  constructor(
    private readonly store: PasswordLoginStore,
    private readonly dummyPasswordHash: string
  ) {}

  async authenticate(input: {
    readonly email: string;
    readonly password: string;
  }): Promise<
    | { readonly outcome: "FAILED" }
    | { readonly outcome: "PASSWORD_VERIFIED"; readonly userId: string }
  > {
    const account = await this.store.findByEmail(input.email);
    const verified = await verifyPasswordHash(
      input.password,
      account?.passwordHash ?? this.dummyPasswordHash
    );
    if (!verified || account?.status !== "ACTIVE") return { outcome: "FAILED" };
    await this.store.recordSuccessfulPasswordLogin(account.userId);
    return { outcome: "PASSWORD_VERIFIED", userId: account.userId };
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
