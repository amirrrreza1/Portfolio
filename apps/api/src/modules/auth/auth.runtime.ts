import { createHash } from "node:crypto";

import { hashPassword } from "@portfolio/auth-core";
import {
  createWebAuthnChallengeStore,
  getDatabaseClient,
  type Database,
} from "@portfolio/database";
import nodemailer from "nodemailer";

import { parseApiEnvironment } from "../../config/environment.js";
import {
  AuthService,
  type AuthStore,
  type SecurityNotifier,
} from "./auth.service.js";

/**
 * Everything that turns the pure boundary into a running one: Prisma adapters,
 * the SMTP notifier, and the request-derived identifiers the service uses for
 * throttling and session summaries.
 */

/**
 * A coarse client label, derived server-side.
 *
 * SECURITY.md §4 forbids showing raw user-agent strings back to the owner, so
 * the full string never reaches storage — only a bounded label good enough to
 * answer "is that my laptop or not". Anything unrecognized becomes the same
 * generic value rather than a truncated fingerprint.
 */
export function summarizeClient(userAgent: string | undefined): string | null {
  if (!userAgent) return null;
  const browser = /\bEdg\//.test(userAgent)
    ? "Edge"
    : /\bOPR\//.test(userAgent)
      ? "Opera"
      : /\bFirefox\//.test(userAgent)
        ? "Firefox"
        : /\bChrome\//.test(userAgent)
          ? "Chrome"
          : /\bSafari\//.test(userAgent)
            ? "Safari"
            : "Unknown browser";
  const platform = /\bWindows\b/.test(userAgent)
    ? "Windows"
    : /\b(iPhone|iPad|iOS)\b/.test(userAgent)
      ? "iOS"
      : /\bAndroid\b/.test(userAgent)
        ? "Android"
        : /\bMac OS X\b/.test(userAgent)
          ? "macOS"
          : /\bLinux\b/.test(userAgent)
            ? "Linux"
            : "unknown platform";
  return `${browser} on ${platform}`;
}

/**
 * A keyed hash of the network prefix, never the address.
 *
 * The throttle needs to tell one network from another; nothing needs to know
 * which network. Truncating to /24 and /48 before hashing means a stored value
 * cannot be reversed into a household even if the secret leaks, and keying it
 * means it cannot be reversed by enumeration either.
 */
export function hashNetworkPrefix(
  secret: string,
  ip: string | undefined
): string | null {
  if (!ip) return null;
  const prefix = ip.includes(":")
    ? ip.split(":").slice(0, 3).join(":")
    : ip.split(".").slice(0, 3).join(".");
  return createHash("sha256")
    .update(`${secret}:${prefix}`)
    .digest("hex")
    .slice(0, 32);
}

/** A stable, non-reversible key for per-account throttling. */
export function accountThrottleKey(secret: string, email: string): string {
  return createHash("sha256")
    .update(`${secret}:${email.trim().toLowerCase()}`)
    .digest("hex")
    .slice(0, 32);
}

export function createPrismaAuthStore(database: Database): AuthStore {
  return {
    async findUserByEmail(email) {
      const user = await database.user.findUnique({ where: { email } });
      return user === null
        ? null
        : {
            userId: user.id,
            email: user.email,
            displayName: user.displayName,
            role: user.role,
            status: user.status,
            passwordHash: user.passwordHash,
          };
    },
    async findUserById(userId) {
      const user = await database.user.findUnique({ where: { id: userId } });
      return user === null
        ? null
        : {
            userId: user.id,
            email: user.email,
            displayName: user.displayName,
            role: user.role,
            status: user.status,
            passwordHash: user.passwordHash,
          };
    },
    async recordSuccessfulPasswordLogin(userId) {
      await database.user.update({
        where: { id: userId },
        data: { lastLoginAt: new Date() },
      });
    },

    async createSession(input) {
      const session = await database.session.create({
        data: {
          userId: input.userId,
          tokenHash: input.tokenHash,
          csrfBindingHash: input.csrfBindingHash,
          expiresAt: input.expiresAt,
          userAgentSummary: input.client,
          ipPrefixHash: input.ipPrefixHash,
        },
        select: { id: true },
      });
      return session.id;
    },
    async findSessionByTokenHash(tokenHash) {
      const session = await database.session.findUnique({
        where: { tokenHash },
      });
      return session === null ? null : toSessionRecord(session);
    },
    async findSessionById(sessionId) {
      const session = await database.session.findUnique({
        where: { id: sessionId },
      });
      return session === null ? null : toSessionRecord(session);
    },
    async touchSession(sessionId, at) {
      await database.session.update({
        where: { id: sessionId },
        data: { lastSeenAt: at },
      });
    },
    async rotateCsrfBinding(sessionId, bindingHash) {
      await database.session.update({
        where: { id: sessionId },
        data: { csrfBindingHash: bindingHash },
      });
    },
    async revokeSession(sessionId, reason, at) {
      // `revokedAt: null` in the predicate keeps the first revocation's reason
      // and timestamp: an expiry sweep must not overwrite "the owner revoked
      // this", which is the entry that matters in an audit.
      await database.session.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: at, revokedReason: reason },
      });
    },
    async revokeOtherSessions(input) {
      const result = await database.session.updateMany({
        where: {
          userId: input.userId,
          revokedAt: null,
          ...(input.exceptSessionId === null
            ? {}
            : { id: { not: input.exceptSessionId } }),
        },
        data: { revokedAt: input.at, revokedReason: input.reason },
      });
      return result.count;
    },
    async listSessions(userId) {
      const sessions = await database.session.findMany({
        where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { lastSeenAt: "desc" },
        take: 50,
      });
      return sessions.map(toSessionRecord);
    },

    async findCredentialById(credentialId) {
      const credential = await database.webAuthnCredential.findUnique({
        where: { credentialId },
      });
      return credential === null
        ? null
        : {
            credentialId: credential.credentialId,
            userId: credential.userId,
            publicKey: new Uint8Array(credential.publicKey),
            counter: Number(credential.counter),
            transports: credential.transports,
          };
    },
    async listCredentials(userId) {
      const credentials = await database.webAuthnCredential.findMany({
        where: { userId },
      });
      return credentials.map((credential) => ({
        credentialId: credential.credentialId,
        userId: credential.userId,
        publicKey: new Uint8Array(credential.publicKey),
        counter: Number(credential.counter),
        transports: credential.transports,
      }));
    },
    async createCredential(input) {
      await database.webAuthnCredential.create({
        data: {
          userId: input.userId,
          credentialId: input.credentialId,
          publicKey: Buffer.from(input.publicKey),
          counter: BigInt(input.counter),
          transports: [...input.transports],
          label: input.label,
          backedUp: input.backedUp,
          deviceType: input.deviceType,
        },
      });
    },
    async updateCredentialCounter(input) {
      await database.webAuthnCredential.update({
        where: { credentialId: input.credentialId },
        data: { counter: BigInt(input.counter), lastUsedAt: input.at },
      });
    },

    async consumeRecoveryCode(input) {
      // One statement, so two simultaneous uses of the same code cannot both
      // see it unused. `updateMany` with `usedAt: null` in the predicate is
      // the whole single-use guarantee.
      const result = await database.recoveryCode.updateMany({
        where: {
          userId: input.userId,
          codeHash: input.codeHash,
          usedAt: null,
        },
        data: { usedAt: new Date() },
      });
      return result.count === 1;
    },

    async recordAuditEvent(event) {
      await database.auditEvent.create({
        data: {
          actorId: event.actorId,
          eventType: event.eventType,
          targetType: event.targetType,
          targetId: event.targetId,
          outcome: event.outcome,
          metadata: event.metadata as never,
        },
      });
    },
  };
}

function toSessionRecord(session: {
  id: string;
  userId: string;
  csrfBindingHash: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  userAgentSummary: string | null;
}) {
  return {
    id: session.id,
    userId: session.userId,
    csrfBindingHash: session.csrfBindingHash,
    createdAt: session.createdAt,
    lastSeenAt: session.lastSeenAt,
    expiresAt: session.expiresAt,
    revokedAt: session.revokedAt,
    client: session.userAgentSummary,
  };
}

/**
 * Security notifications over the same SMTP transport the contact form uses.
 *
 * Failure is logged and swallowed. A recovery code that was legitimately used
 * must not be rejected because the mail server was down — the code is already
 * spent and the sessions are already revoked, and failing the request would
 * lock the owner out at exactly the moment they are trying to get back in.
 */
export function createSmtpSecurityNotifier(input: {
  readonly smtpUrl: string;
  readonly fromEmail: string;
  readonly resolveRecipient: (userId: string) => Promise<string | null>;
}): SecurityNotifier {
  const transport = nodemailer.createTransport(input.smtpUrl);
  return {
    async notify(event) {
      try {
        const to = await input.resolveRecipient(event.userId);
        if (to === null) return;
        await transport.sendMail({
          from: input.fromEmail,
          to,
          subject: `Security alert: ${event.event}`,
          text: `${event.detail}\n\nIf this was not you, revoke your sessions and rotate your credentials immediately.`,
        });
      } catch {
        process.stderr.write(
          `security notification ${event.event} could not be delivered\n`
        );
      }
    },
  };
}

export interface AuthRuntime {
  readonly service: AuthService;
  readonly rpName: string;
  readonly origin: string;
  readonly csrfSecret: string;
  readonly hashSecret: string;
}

export async function createAuthRuntime(): Promise<AuthRuntime> {
  const environment = parseApiEnvironment(process.env);
  const database = getDatabaseClient({
    connectionString: environment.databaseUrl,
  });
  const store = createPrismaAuthStore(database);

  return {
    service: new AuthService({
      store,
      challenges: createWebAuthnChallengeStore(database),
      secrets: {
        sessionSecret: environment.auth.sessionSecret,
        csrfSecret: environment.auth.csrfSecret,
        recoverySecret: environment.auth.recoverySecret,
      },
      relyingParty: {
        rpId: environment.auth.rpId,
        rpName: environment.auth.rpName,
        origin: environment.auth.origin,
      },
      notifier: createSmtpSecurityNotifier({
        smtpUrl: environment.smtpUrl,
        fromEmail: environment.contactFromEmail,
        resolveRecipient: async (userId) =>
          (await store.findUserById(userId))?.email ?? null,
      }),
      // Hashed once at boot from a value that is not a password anyone holds.
      // Verifying it is what keeps a miss the same cost as a hit.
      dummyPasswordHash: await hashPassword(
        `unusable:${environment.auth.sessionSecret}`
      ),
    }),
    rpName: environment.auth.rpName,
    origin: environment.auth.origin,
    csrfSecret: environment.auth.csrfSecret,
    hashSecret: environment.auth.sessionSecret,
  };
}
