import {
  consumeWebAuthnChallenge,
  isSessionUsable,
  issueSession,
  issueWebAuthnChallenge,
  peekWebAuthnChallenge,
  PasswordLoginService,
  recoveryCodeHash,
  sessionTokenHash,
  type IssuedSession,
  type SessionSecrets,
  type WebAuthnChallengePurpose,
  type WebAuthnChallengeStore,
} from "@portfolio/auth-core";
import {
  RECENT_AUTH_WINDOW_MINUTES,
  type LoginChallenge,
  type Role,
  type SessionActor,
  type SessionSummary,
  type UserStatus,
  type WebAuthnAssertion,
  type WebAuthnRegistration,
} from "@portfolio/contracts/auth";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";

/**
 * The authenticated boundary.
 *
 * Every dependency is a port, for the same reason the publication worker takes
 * its own: the interesting behaviour here is refusal, and refusals are only
 * testable if the database, the clock, and the notifier can be driven from a
 * test. Nothing in this file talks to Prisma, Nest, or Fastify.
 *
 * Two rules shape the whole file and are worth stating once:
 *
 *   1. **A failure looks the same whatever caused it.** An unknown account, a
 *      wrong password, a locked user, and an expired challenge all produce the
 *      same response and, as far as is practical, the same work. A login
 *      endpoint that answers differently is an account-enumeration oracle
 *      whether or not it means to be.
 *   2. **A session is only ever issued after both factors.** The password step
 *      returns a challenge, never a cookie.
 */

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

export interface AuthUserRecord {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: Role;
  readonly status: UserStatus;
  readonly passwordHash: string;
}

export interface AuthSessionRecord {
  readonly id: string;
  readonly userId: string;
  readonly csrfBindingHash: string;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly client: string | null;
}

export interface AuthCredentialRecord {
  readonly credentialId: string;
  readonly userId: string;
  readonly publicKey: Uint8Array;
  readonly counter: number;
  readonly transports: readonly string[];
}

export interface SessionCreateInput {
  readonly userId: string;
  readonly tokenHash: string;
  readonly csrfBindingHash: string;
  readonly expiresAt: Date;
  readonly client: string | null;
  readonly ipPrefixHash: string | null;
}

export interface AuthStore {
  findUserByEmail(email: string): Promise<AuthUserRecord | null>;
  findUserById(userId: string): Promise<AuthUserRecord | null>;
  recordSuccessfulPasswordLogin(userId: string): Promise<void>;

  createSession(input: SessionCreateInput): Promise<string>;
  findSessionByTokenHash(tokenHash: string): Promise<AuthSessionRecord | null>;
  findSessionById(sessionId: string): Promise<AuthSessionRecord | null>;
  touchSession(sessionId: string, at: Date): Promise<void>;
  rotateCsrfBinding(sessionId: string, bindingHash: string): Promise<void>;
  revokeSession(sessionId: string, reason: string, at: Date): Promise<void>;
  /** Returns how many were revoked. Used by security changes and recovery. */
  revokeOtherSessions(input: {
    readonly userId: string;
    readonly exceptSessionId: string | null;
    readonly reason: string;
    readonly at: Date;
  }): Promise<number>;
  listSessions(userId: string): Promise<readonly AuthSessionRecord[]>;

  findCredentialById(
    credentialId: string
  ): Promise<AuthCredentialRecord | null>;
  listCredentials(userId: string): Promise<readonly AuthCredentialRecord[]>;
  createCredential(input: {
    readonly userId: string;
    readonly credentialId: string;
    readonly publicKey: Uint8Array;
    readonly counter: number;
    readonly transports: readonly string[];
    readonly label: string;
    readonly backedUp: boolean;
    readonly deviceType: string | null;
  }): Promise<void>;
  updateCredentialCounter(input: {
    readonly credentialId: string;
    readonly counter: number;
    readonly at: Date;
  }): Promise<void>;

  /** Single-use by construction: returns false if the code was already spent. */
  consumeRecoveryCode(input: {
    readonly userId: string;
    readonly codeHash: string;
  }): Promise<boolean>;

  recordAuditEvent(event: AuditEvent): Promise<void>;
}

export interface AuditEvent {
  readonly eventType: string;
  readonly outcome: "SUCCESS" | "FAILURE";
  readonly actorId: string | null;
  readonly targetType: string | null;
  readonly targetId: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
}

/** Out-of-band warning for events the owner must hear about immediately. */
export interface SecurityNotifier {
  notify(input: {
    readonly userId: string;
    readonly event: string;
    readonly detail: string;
  }): Promise<void>;
}

export interface WebAuthnRelyingParty {
  readonly rpId: string;
  readonly rpName: string;
  readonly origin: string;
}

export interface AuthServiceOptions {
  readonly store: AuthStore;
  readonly challenges: WebAuthnChallengeStore;
  readonly secrets: SessionSecrets & { readonly recoverySecret: string };
  readonly relyingParty: WebAuthnRelyingParty;
  readonly notifier: SecurityNotifier;
  /** Argon2 hash verified when no account matches, so timing does not differ. */
  readonly dummyPasswordHash: string;
  readonly now?: () => Date;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export interface AuthenticatedRequest {
  readonly session: AuthSessionRecord;
  readonly user: AuthUserRecord;
  readonly recentlyAuthenticated: boolean;
}

export type SessionIssue =
  | { readonly kind: "issued"; readonly session: IssuedSession }
  | { readonly kind: "rejected" };

/**
 * Every rejection collapses to this.
 *
 * The controller maps it to one status and one body. Distinguishing "no such
 * user" from "wrong password" from "expired challenge" in the response is the
 * enumeration oracle this class exists to avoid.
 */
export class AuthenticationRejectedError extends Error {
  public constructor() {
    super("Authentication failed.");
    this.name = "AuthenticationRejectedError";
  }
}

/** Raised when an action needs a fresher authentication than this session has. */
export class RecentAuthenticationRequiredError extends Error {
  public constructor() {
    super("Recent authentication is required.");
    this.name = "RecentAuthenticationRequiredError";
  }
}

export class ThrottledError extends Error {
  public constructor(readonly retryAfterSeconds: number) {
    super("Too many attempts.");
    this.name = "ThrottledError";
  }
}

// ---------------------------------------------------------------------------
// Throttle
// ---------------------------------------------------------------------------

interface ThrottleEntry {
  failures: number;
  blockedUntil: number;
}

/**
 * Progressive per-key throttle, bounded in memory.
 *
 * Keyed twice by the caller — once by account, once by network — because
 * either alone is trivially evaded: per-account only lets one attacker spray
 * every account from one host, per-network only lets a botnet grind one
 * account. Neither key is ever compared against a stored account, so a
 * throttle response says nothing about whether the account exists.
 *
 * Process-local. SECURITY.md §12 requires a shared limiter or edge enforcement
 * before this runs at more than one replica, and M9 owns that.
 */
export class ProgressiveThrottle {
  readonly #entries = new Map<string, ThrottleEntry>();

  public constructor(
    private readonly freeAttempts = 5,
    private readonly baseDelaySeconds = 30,
    private readonly maxDelaySeconds = 900,
    private readonly capacity = 10_000
  ) {}

  /** Throws when the key is blocked; otherwise records the attempt. */
  check(key: string, now: number): void {
    const entry = this.#entries.get(key);
    if (entry && entry.blockedUntil > now) {
      throw new ThrottledError(Math.ceil((entry.blockedUntil - now) / 1000));
    }
  }

  fail(key: string, now: number): void {
    if (this.#entries.size >= this.capacity) this.#evictOldest(now);
    const entry = this.#entries.get(key) ?? { failures: 0, blockedUntil: 0 };
    entry.failures += 1;
    if (entry.failures > this.freeAttempts) {
      const factor = 2 ** (entry.failures - this.freeAttempts - 1);
      const delay = Math.min(
        this.baseDelaySeconds * factor,
        this.maxDelaySeconds
      );
      entry.blockedUntil = now + delay * 1000;
    }
    this.#entries.set(key, entry);
  }

  succeed(key: string): void {
    this.#entries.delete(key);
  }

  #evictOldest(now: number): void {
    for (const [key, entry] of this.#entries) {
      if (entry.blockedUntil <= now) this.#entries.delete(key);
      if (this.#entries.size < this.capacity) return;
    }
    const first = this.#entries.keys().next();
    if (!first.done) this.#entries.delete(first.value);
  }
}

// ---------------------------------------------------------------------------

const RECOVERY_FREE_ATTEMPTS = 2;

export class AuthService {
  readonly #store: AuthStore;
  readonly #challenges: WebAuthnChallengeStore;
  readonly #secrets: SessionSecrets & { readonly recoverySecret: string };
  readonly #relyingParty: WebAuthnRelyingParty;
  readonly #notifier: SecurityNotifier;
  readonly #passwordLogin: PasswordLoginService;
  readonly #now: () => Date;
  readonly #loginThrottle = new ProgressiveThrottle();
  readonly #recoveryThrottle = new ProgressiveThrottle(RECOVERY_FREE_ATTEMPTS);

  public constructor(options: AuthServiceOptions) {
    this.#store = options.store;
    this.#challenges = options.challenges;
    this.#secrets = options.secrets;
    this.#relyingParty = options.relyingParty;
    this.#notifier = options.notifier;
    this.#now = options.now ?? (() => new Date());
    this.#passwordLogin = new PasswordLoginService(
      {
        findByEmail: async (email) => {
          const user = await this.#store.findUserByEmail(email);
          return user === null
            ? null
            : {
                userId: user.userId,
                passwordHash: user.passwordHash,
                status: user.status,
              };
        },
        recordSuccessfulPasswordLogin: (userId) =>
          this.#store.recordSuccessfulPasswordLogin(userId),
      },
      options.dummyPasswordHash
    );
  }

  // -------------------------------------------------------------------------
  // Login
  // -------------------------------------------------------------------------

  /**
   * `POST /auth/login/password`.
   *
   * Always returns a challenge. A failed password produces a challenge bound
   * to no user, which the assertion step cannot satisfy — so the failure
   * surfaces one step later, in a response that is identical for every cause.
   */
  async beginPasswordLogin(input: {
    readonly email: string;
    readonly password: string;
    readonly accountKey: string;
    readonly networkKey: string;
  }): Promise<LoginChallenge> {
    const now = this.#now();
    const milliseconds = now.getTime();
    this.#loginThrottle.check(`a:${input.accountKey}`, milliseconds);
    this.#loginThrottle.check(`n:${input.networkKey}`, milliseconds);

    const result = await this.#passwordLogin.authenticate({
      email: input.email,
      password: input.password,
    });

    if (result.outcome === "FAILED") {
      this.#loginThrottle.fail(`a:${input.accountKey}`, milliseconds);
      this.#loginThrottle.fail(`n:${input.networkKey}`, milliseconds);
      await this.#audit({
        eventType: "auth.password.failed",
        outcome: "FAILURE",
        actorId: null,
        targetType: "User",
        targetId: null,
        metadata: {},
      });
    } else {
      await this.#audit({
        eventType: "auth.password.verified",
        outcome: "SUCCESS",
        actorId: result.userId,
        targetType: "User",
        targetId: result.userId,
        metadata: {},
      });
    }

    // Issued in both branches, and deliberately so.
    const challenge = await issueWebAuthnChallenge({
      store: this.#challenges,
      purpose: "LOGIN",
      userId: result.outcome === "PASSWORD_VERIFIED" ? result.userId : null,
      now,
    });
    return {
      challengeId: challenge.id,
      expiresAt: challenge.expiresAt.toISOString(),
    };
  }

  /**
   * `POST /auth/webauthn/options`.
   *
   * No `allowCredentials`. Sending the list would answer "does this account
   * have passkeys, and how many" to anyone who guessed a password wrong, and
   * omitting it makes the response for a real flow and a doomed one identical
   * in shape. The authenticator selects a discoverable credential instead.
   */
  async authenticationOptions(input: {
    readonly challengeId: string;
    readonly purpose: WebAuthnChallengePurpose;
  }): Promise<Record<string, unknown>> {
    const record = await peekWebAuthnChallenge({
      store: this.#challenges,
      id: input.challengeId,
      purpose: input.purpose,
      now: this.#now(),
    });
    if (record === null) throw new AuthenticationRejectedError();

    return (await generateAuthenticationOptions({
      rpID: this.#relyingParty.rpId,
      // Decoded to bytes on the way in. The generator base64url-encodes
      // whatever it is given, so handing it the already-encoded string
      // produces a *doubly* encoded challenge in the options — which the
      // browser then signs, and which can never match the stored value the
      // verify step compares against.
      challenge: Buffer.from(record.challenge, "base64url"),
      userVerification: "required",
      timeout: 60_000,
    })) as unknown as Record<string, unknown>;
  }

  /**
   * `POST /auth/webauthn/verify` — the step that actually authenticates.
   *
   * The challenge is consumed first, so a replay of the same assertion finds
   * nothing to verify against even if every other check would have passed.
   */
  async verifyAssertion(input: {
    readonly challengeId: string;
    readonly assertion: WebAuthnAssertion;
    readonly purpose: WebAuthnChallengePurpose;
    readonly client: string | null;
    readonly ipPrefixHash: string | null;
    readonly networkKey: string;
  }): Promise<{ readonly session: IssuedSession; readonly userId: string }> {
    const now = this.#now();
    const milliseconds = now.getTime();
    this.#loginThrottle.check(`n:${input.networkKey}`, milliseconds);

    const record = await consumeWebAuthnChallenge({
      store: this.#challenges,
      id: input.challengeId,
      purpose: input.purpose,
      now,
    });
    if (record === null || record.userId === null) {
      this.#loginThrottle.fail(`n:${input.networkKey}`, milliseconds);
      await this.#audit({
        eventType: "auth.webauthn.failed",
        outcome: "FAILURE",
        actorId: record?.userId ?? null,
        targetType: "User",
        targetId: record?.userId ?? null,
        metadata: { reason: "challenge" },
      });
      throw new AuthenticationRejectedError();
    }

    const credential = await this.#store.findCredentialById(input.assertion.id);
    const user = await this.#store.findUserById(record.userId);
    if (
      credential === null ||
      user === null ||
      credential.userId !== record.userId ||
      user.status !== "ACTIVE"
    ) {
      this.#loginThrottle.fail(`n:${input.networkKey}`, milliseconds);
      await this.#audit({
        eventType: "auth.webauthn.failed",
        outcome: "FAILURE",
        actorId: record.userId,
        targetType: "User",
        targetId: record.userId,
        metadata: { reason: "credential" },
      });
      throw new AuthenticationRejectedError();
    }

    let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
    try {
      verification = await verifyAuthenticationResponse({
        response: input.assertion as never,
        expectedChallenge: record.challenge,
        expectedOrigin: this.#relyingParty.origin,
        expectedRPID: this.#relyingParty.rpId,
        requireUserVerification: true,
        credential: {
          // The library types the key as `Uint8Array<ArrayBuffer>`; Prisma
          // hands back a Buffer, whose backing store TypeScript models as
          // `ArrayBufferLike`. The bytes are identical either way.
          id: credential.credentialId,
          publicKey: credential.publicKey as Uint8Array<ArrayBuffer>,
          counter: credential.counter,
          transports: credential.transports as never,
        },
      });
    } catch (error) {
      // The verifier's message says which check failed — expired challenge,
      // wrong origin, bad signature. It is written to the server log and never
      // to the response: an operator needs it to debug a real authenticator,
      // and an attacker must not be told which of their guesses was closest.
      process.stderr.write(
        `webauthn verification rejected: ${
          error instanceof Error ? error.message : "unknown"
        }\n`
      );
      verification = { verified: false } as never;
    }

    // A counter that has not advanced is the signature of a cloned
    // authenticator replaying a captured assertion. The verifier already
    // rejects it, so this only classifies the rejection: an owner needs to be
    // told the difference between "someone got the password wrong" and
    // "something is replaying your passkey". Zero is the documented "this
    // authenticator does not count" value and is exempt.
    const newCounter = verification.authenticationInfo?.newCounter ?? 0;
    const presented = presentedCounter(
      input.assertion.response.authenticatorData
    );
    const counterRegressed =
      credential.counter > 0 &&
      presented !== null &&
      presented <= credential.counter;

    if (!verification.verified || counterRegressed) {
      this.#loginThrottle.fail(`n:${input.networkKey}`, milliseconds);
      await this.#audit({
        eventType: "auth.webauthn.failed",
        outcome: "FAILURE",
        actorId: record.userId,
        targetType: "WebAuthnCredential",
        targetId: credential.credentialId,
        metadata: { reason: counterRegressed ? "counter" : "signature" },
      });
      if (counterRegressed) {
        await this.#notifier.notify({
          userId: record.userId,
          event: "webauthn.counter.regressed",
          detail:
            "A passkey assertion arrived with a counter that had not advanced.",
        });
      }
      throw new AuthenticationRejectedError();
    }

    await this.#store.updateCredentialCounter({
      credentialId: credential.credentialId,
      counter: newCounter,
      at: now,
    });
    this.#loginThrottle.succeed(`n:${input.networkKey}`);

    const session = await this.#issueSessionFor({
      userId: record.userId,
      client: input.client,
      ipPrefixHash: input.ipPrefixHash,
      now,
    });
    await this.#audit({
      eventType:
        input.purpose === "REAUTH" ? "auth.reauthenticated" : "auth.login",
      outcome: "SUCCESS",
      actorId: record.userId,
      targetType: "User",
      targetId: record.userId,
      metadata: { purpose: input.purpose },
    });
    return { session, userId: record.userId };
  }

  // -------------------------------------------------------------------------
  // Recovery
  // -------------------------------------------------------------------------

  /**
   * `POST /auth/recovery/verify`.
   *
   * Stricter limits than login, and it revokes every existing session: a
   * recovery code is used when the owner believes they have lost control, and
   * leaving other sessions alive would defeat the point. The notification is
   * mandatory rather than best-effort for the same reason.
   */
  async verifyRecovery(input: {
    readonly email: string;
    readonly code: string;
    readonly accountKey: string;
    readonly networkKey: string;
    readonly client: string | null;
    readonly ipPrefixHash: string | null;
  }): Promise<IssuedSession> {
    const now = this.#now();
    const milliseconds = now.getTime();
    this.#recoveryThrottle.check(`a:${input.accountKey}`, milliseconds);
    this.#recoveryThrottle.check(`n:${input.networkKey}`, milliseconds);

    const user = await this.#store.findUserByEmail(input.email);
    const codeHash = recoveryCodeHash(this.#secrets.recoverySecret, input.code);
    const consumed =
      user !== null &&
      user.status === "ACTIVE" &&
      codeHash !== null &&
      (await this.#store.consumeRecoveryCode({
        userId: user.userId,
        codeHash,
      }));

    if (!consumed || user === null) {
      this.#recoveryThrottle.fail(`a:${input.accountKey}`, milliseconds);
      this.#recoveryThrottle.fail(`n:${input.networkKey}`, milliseconds);
      await this.#audit({
        eventType: "auth.recovery.failed",
        outcome: "FAILURE",
        actorId: user?.userId ?? null,
        targetType: "User",
        targetId: user?.userId ?? null,
        metadata: {},
      });
      throw new AuthenticationRejectedError();
    }

    const revoked = await this.#store.revokeOtherSessions({
      userId: user.userId,
      exceptSessionId: null,
      reason: "SECURITY_CHANGE",
      at: now,
    });
    const session = await this.#issueSessionFor({
      userId: user.userId,
      client: input.client,
      ipPrefixHash: input.ipPrefixHash,
      now,
    });
    this.#recoveryThrottle.succeed(`a:${input.accountKey}`);
    await this.#audit({
      eventType: "auth.recovery.used",
      outcome: "SUCCESS",
      actorId: user.userId,
      targetType: "User",
      targetId: user.userId,
      metadata: { revokedSessions: revoked },
    });
    await this.#notifier.notify({
      userId: user.userId,
      event: "recovery.code.used",
      detail: `A recovery code was used and ${revoked} other session(s) were revoked.`,
    });
    return session;
  }

  // -------------------------------------------------------------------------
  // Passkey enrolment
  // -------------------------------------------------------------------------

  /**
   * `POST /auth/webauthn/enroll/options`.
   *
   * Enrolment is authenticated and recent-auth gated, which answers the
   * bootstrap question without inventing a second one: provisioning issues
   * recovery codes, a code buys a session, and the first passkey is enrolled
   * from that session. No separate enrolment token, no window during which an
   * unauthenticated caller may register a credential.
   *
   * Already-registered credentials are excluded so an authenticator that is
   * already enrolled says so instead of silently creating a duplicate.
   */
  async beginEnrolment(
    request: AuthenticatedRequest
  ): Promise<Record<string, unknown>> {
    if (!request.recentlyAuthenticated) {
      throw new RecentAuthenticationRequiredError();
    }
    const now = this.#now();
    const existing = await this.#store.listCredentials(request.user.userId);
    const challenge = await issueWebAuthnChallenge({
      store: this.#challenges,
      purpose: "ENROLL",
      userId: request.user.userId,
      now,
    });
    const options = await generateRegistrationOptions({
      rpID: this.#relyingParty.rpId,
      rpName: this.#relyingParty.rpName,
      userName: request.user.email,
      userDisplayName: request.user.displayName,
      challenge: Buffer.from(challenge.challenge, "base64url"),
      attestationType: "none",
      excludeCredentials: existing.map((credential) => ({
        id: credential.credentialId,
      })),
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
      timeout: 60_000,
    });
    return {
      ...(options as unknown as Record<string, unknown>),
      challengeId: challenge.id,
    };
  }

  /** `POST /auth/webauthn/enroll` — verifies and stores a new passkey. */
  async completeEnrolment(
    request: AuthenticatedRequest,
    input: {
      readonly challengeId: string;
      readonly label: string;
      readonly registration: WebAuthnRegistration;
    }
  ): Promise<{ readonly credentialId: string }> {
    if (!request.recentlyAuthenticated) {
      throw new RecentAuthenticationRequiredError();
    }
    const now = this.#now();
    const record = await consumeWebAuthnChallenge({
      store: this.#challenges,
      id: input.challengeId,
      purpose: "ENROLL",
      now,
    });
    if (record === null || record.userId !== request.user.userId) {
      await this.#audit({
        eventType: "auth.credential.enrolment.failed",
        outcome: "FAILURE",
        actorId: request.user.userId,
        targetType: "WebAuthnCredential",
        targetId: null,
        metadata: { reason: "challenge" },
      });
      throw new AuthenticationRejectedError();
    }

    let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
    try {
      verification = await verifyRegistrationResponse({
        response: input.registration as never,
        expectedChallenge: record.challenge,
        expectedOrigin: this.#relyingParty.origin,
        expectedRPID: this.#relyingParty.rpId,
        requireUserVerification: true,
      });
    } catch (error) {
      process.stderr.write(
        `webauthn enrolment rejected: ${
          error instanceof Error ? error.message : "unknown"
        }\n`
      );
      verification = { verified: false } as never;
    }

    const registered = verification.registrationInfo;
    if (!verification.verified || registered === undefined) {
      await this.#audit({
        eventType: "auth.credential.enrolment.failed",
        outcome: "FAILURE",
        actorId: request.user.userId,
        targetType: "WebAuthnCredential",
        targetId: null,
        metadata: { reason: "attestation" },
      });
      throw new AuthenticationRejectedError();
    }

    await this.#store.createCredential({
      userId: request.user.userId,
      credentialId: registered.credential.id,
      publicKey: registered.credential.publicKey,
      counter: registered.credential.counter,
      transports: input.registration.response.transports ?? [],
      label: input.label,
      backedUp: registered.credentialBackedUp,
      deviceType: registered.credentialDeviceType,
    });
    await this.#audit({
      eventType: "auth.credential.enrolled",
      outcome: "SUCCESS",
      actorId: request.user.userId,
      targetType: "WebAuthnCredential",
      targetId: registered.credential.id,
      metadata: { label: input.label },
    });
    // A new way into the account is exactly the kind of change the owner has
    // to hear about, whether or not they made it.
    await this.#notifier.notify({
      userId: request.user.userId,
      event: "credential.enrolled",
      detail: `A new passkey labelled "${input.label}" was added to your account.`,
    });
    return { credentialId: registered.credential.id };
  }

  // -------------------------------------------------------------------------
  // Session lifecycle
  // -------------------------------------------------------------------------

  /**
   * Resolves a request's session cookie, or null.
   *
   * Also the place idle expiry is enforced and `lastSeenAt` advances, so no
   * caller can forget to do either.
   */
  async authenticate(
    sessionToken: string | undefined
  ): Promise<AuthenticatedRequest | null> {
    if (sessionToken === undefined || sessionToken.length === 0) return null;
    const tokenHash = sessionTokenHash(
      this.#secrets.sessionSecret,
      sessionToken
    );
    const session = await this.#store.findSessionByTokenHash(tokenHash);
    if (session === null) return null;

    const now = this.#now();
    // No separate token comparison: the row was found *by* the keyed hash of
    // the presented token, so a match is what produced this record.
    if (
      !isSessionUsable({
        expiresAt: session.expiresAt,
        lastSeenAt: session.lastSeenAt,
        revokedAt: session.revokedAt,
        now,
      })
    ) {
      if (session.revokedAt === null) {
        await this.#store.revokeSession(session.id, "EXPIRED", now);
      }
      return null;
    }

    const user = await this.#store.findUserById(session.userId);
    if (user === null || user.status !== "ACTIVE") {
      await this.#store.revokeSession(session.id, "ACCOUNT_DISABLED", now);
      return null;
    }

    await this.#store.touchSession(session.id, now);
    return {
      session,
      user,
      recentlyAuthenticated: this.#isRecent(session.createdAt, now),
    };
  }

  /** `GET /auth/session`. */
  describeActor(request: AuthenticatedRequest): SessionActor {
    return {
      userId: request.user.userId as SessionActor["userId"],
      displayName: request.user.displayName,
      role: request.user.role,
      recentlyAuthenticated: request.recentlyAuthenticated,
      expiresAt: request.session.expiresAt.toISOString(),
    };
  }

  /** `GET /auth/csrf` — rotates the binding, so a leaked token stops working. */
  async rotateCsrf(request: AuthenticatedRequest): Promise<IssuedSession> {
    const rotated = issueSession(this.#secrets, this.#now());
    await this.#store.rotateCsrfBinding(
      request.session.id,
      rotated.csrfBindingHash
    );
    return rotated;
  }

  /** `POST /auth/reauthenticate` — begins a fresh WebAuthn challenge. */
  async beginReauthentication(
    request: AuthenticatedRequest
  ): Promise<LoginChallenge> {
    const challenge = await issueWebAuthnChallenge({
      store: this.#challenges,
      purpose: "REAUTH",
      userId: request.user.userId,
      now: this.#now(),
    });
    return {
      challengeId: challenge.id,
      expiresAt: challenge.expiresAt.toISOString(),
    };
  }

  async logout(request: AuthenticatedRequest): Promise<void> {
    const now = this.#now();
    await this.#store.revokeSession(request.session.id, "LOGOUT", now);
    await this.#audit({
      eventType: "auth.logout",
      outcome: "SUCCESS",
      actorId: request.user.userId,
      targetType: "Session",
      targetId: request.session.id,
      metadata: {},
    });
  }

  async listSessions(
    request: AuthenticatedRequest
  ): Promise<readonly SessionSummary[]> {
    const sessions = await this.#store.listSessions(request.user.userId);
    return sessions.map((session) => ({
      id: session.id as SessionSummary["id"],
      client: session.client ?? "Unknown client",
      createdAt: session.createdAt.toISOString(),
      lastSeenAt: session.lastSeenAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      current: session.id === request.session.id,
    }));
  }

  /**
   * `DELETE /auth/sessions/:id`.
   *
   * Revoking another session is a session-wide action and needs recent auth
   * (SECURITY.md §3). Revoking your own is just a logout and does not.
   * The ownership check is here, in the service, rather than on the route:
   * a guessed session id from another account must fail even if a future
   * controller forgets to check.
   */
  async revokeSession(
    request: AuthenticatedRequest,
    sessionId: string
  ): Promise<"revoked" | "not-found" | "recent-auth-required"> {
    const target = await this.#store.findSessionById(sessionId);
    if (target === null || target.userId !== request.user.userId) {
      await this.#audit({
        eventType: "auth.session.revoke.denied",
        outcome: "FAILURE",
        actorId: request.user.userId,
        targetType: "Session",
        targetId: sessionId,
        metadata: { reason: "not-owned" },
      });
      return "not-found";
    }
    if (target.id !== request.session.id && !request.recentlyAuthenticated) {
      return "recent-auth-required";
    }
    await this.#store.revokeSession(target.id, "REVOKED", this.#now());
    await this.#audit({
      eventType: "auth.session.revoked",
      outcome: "SUCCESS",
      actorId: request.user.userId,
      targetType: "Session",
      targetId: target.id,
      metadata: { self: target.id === request.session.id },
    });
    return "revoked";
  }

  // -------------------------------------------------------------------------

  async #issueSessionFor(input: {
    readonly userId: string;
    readonly client: string | null;
    readonly ipPrefixHash: string | null;
    readonly now: Date;
  }): Promise<IssuedSession> {
    const session = issueSession(this.#secrets, input.now);
    await this.#store.createSession({
      userId: input.userId,
      tokenHash: session.tokenHash,
      csrfBindingHash: session.csrfBindingHash,
      expiresAt: session.expiresAt,
      client: input.client,
      ipPrefixHash: input.ipPrefixHash,
    });
    return session;
  }

  /**
   * The recent-auth window is measured from when the session token was issued.
   *
   * That is exact rather than approximate: a token is issued at login and
   * re-issued at re-authentication, and at no other time. Storing a separate
   * `lastAuthenticatedAt` would be a second source for the same fact, free to
   * drift from the rotation it is supposed to describe.
   */
  #isRecent(createdAt: Date, now: Date): boolean {
    return (
      now.getTime() - createdAt.getTime() < RECENT_AUTH_WINDOW_MINUTES * 60_000
    );
  }

  async #audit(event: AuditEvent): Promise<void> {
    try {
      await this.#store.recordAuditEvent(event);
    } catch {
      // An unrecorded audit event must not turn a refusal into a 500 — the
      // refusal is the security-relevant behaviour and has to survive.
    }
  }
}

/**
 * The signature counter an assertion claims, read straight from
 * `authenticatorData`.
 *
 * Used only to explain a rejection that has already happened. Nothing is
 * trusted from it: the bytes are unauthenticated until the signature verifies,
 * and by the time this is called the request is being refused either way.
 */
function presentedCounter(authenticatorData: string): number | null {
  try {
    const bytes = Buffer.from(authenticatorData, "base64url");
    // 32 bytes of RP ID hash, one flags byte, then a big-endian counter.
    return bytes.length < 37 ? null : bytes.readUInt32BE(33);
  } catch {
    return null;
  }
}
