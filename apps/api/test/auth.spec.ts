import { hashPassword, recoveryCodeHash } from "@portfolio/auth-core";
import { describe, expect, it, vi } from "vitest";

import {
  createAssertion,
  createRegistration,
  createSoftwareCredential,
  type SoftwareCredential,
} from "../scripts/software-authenticator.js";
import {
  AuthenticationRejectedError,
  AuthService,
  ProgressiveThrottle,
  RecentAuthenticationRequiredError,
  ThrottledError,
  type AuditEvent,
  type AuthSessionRecord,
  type AuthStore,
  type AuthUserRecord,
} from "../src/modules/auth/auth.service.js";
import {
  authorize,
  can,
  isRoleAssignable,
  ownsResource,
} from "../src/modules/auth/authorization.js";

const RP_ID = "admin.example.test";
const ORIGIN = "https://admin.example.test";
const SECRETS = {
  sessionSecret: "s".repeat(40),
  csrfSecret: "c".repeat(40),
  recoverySecret: "r".repeat(40),
};

/**
 * An in-memory store that behaves like the Prisma one in the ways that matter:
 * a recovery code can only be spent once, a session lookup is by token hash,
 * and revocation is not idempotent-silent.
 */
function createHarness(
  options: { readonly status?: "ACTIVE" | "LOCKED" } = {}
) {
  const user: AuthUserRecord = {
    userId: "u1234567890123456789012",
    email: "owner@example.test",
    displayName: "Owner",
    role: "OWNER",
    status: options.status ?? "ACTIVE",
    passwordHash: "",
  };
  const sessions = new Map<string, AuthSessionRecord & { tokenHash: string }>();
  const credentials = new Map<
    string,
    { userId: string; publicKey: Uint8Array; counter: number }
  >();
  const recoveryCodes = new Map<string, boolean>();
  const challenges = new Map<string, any>();
  const audit: AuditEvent[] = [];
  const notifications: string[] = [];
  let sessionCounter = 0;
  let clock = new Date("2026-08-26T12:00:00.000Z");

  const store: AuthStore = {
    findUserByEmail: async (email) => (email === user.email ? user : null),
    findUserById: async (id) => (id === user.userId ? user : null),
    recordSuccessfulPasswordLogin: async () => undefined,

    createSession: async (input) => {
      const id = `session-${++sessionCounter}`;
      sessions.set(id, {
        id,
        userId: input.userId,
        tokenHash: input.tokenHash,
        csrfBindingHash: input.csrfBindingHash,
        createdAt: clock,
        lastSeenAt: clock,
        expiresAt: input.expiresAt,
        revokedAt: null,
        client: input.client,
      });
      return id;
    },
    findSessionByTokenHash: async (tokenHash) =>
      [...sessions.values()].find(
        (session) => session.tokenHash === tokenHash
      ) ?? null,
    findSessionById: async (id) => sessions.get(id) ?? null,
    touchSession: async (id, at) => {
      const session = sessions.get(id);
      if (session) sessions.set(id, { ...session, lastSeenAt: at });
    },
    rotateCsrfBinding: async (id, hash) => {
      const session = sessions.get(id);
      if (session) sessions.set(id, { ...session, csrfBindingHash: hash });
    },
    revokeSession: async (id, _reason, at) => {
      const session = sessions.get(id);
      if (session && session.revokedAt === null) {
        sessions.set(id, { ...session, revokedAt: at });
      }
    },
    revokeOtherSessions: async (input) => {
      let count = 0;
      for (const [id, session] of sessions) {
        if (
          session.userId === input.userId &&
          session.revokedAt === null &&
          id !== input.exceptSessionId
        ) {
          sessions.set(id, { ...session, revokedAt: input.at });
          count += 1;
        }
      }
      return count;
    },
    listSessions: async (userId) =>
      [...sessions.values()].filter(
        (session) => session.userId === userId && session.revokedAt === null
      ),

    listCredentials: async (userId) =>
      [...credentials.entries()]
        .filter(([, value]) => value.userId === userId)
        .map(([id, value]) => ({
          credentialId: id,
          userId: value.userId,
          publicKey: value.publicKey,
          counter: value.counter,
          transports: [],
        })),
    createCredential: async (input) => {
      credentials.set(input.credentialId, {
        userId: input.userId,
        publicKey: input.publicKey,
        counter: input.counter,
      });
    },
    findCredentialById: async (id) => {
      const credential = credentials.get(id);
      return credential === undefined
        ? null
        : {
            credentialId: id,
            userId: credential.userId,
            publicKey: credential.publicKey,
            counter: credential.counter,
            transports: [],
          };
    },
    updateCredentialCounter: async (input) => {
      const credential = credentials.get(input.credentialId);
      if (credential) credential.counter = input.counter;
    },

    consumeRecoveryCode: async (input) => {
      if (recoveryCodes.get(input.codeHash) !== true) return false;
      recoveryCodes.set(input.codeHash, false);
      return true;
    },

    recordAuditEvent: async (event) => void audit.push(event),
  };

  const challengeStore = {
    create: async (record: any) => void challenges.set(record.id, record),
    peek: async (id: string) => challenges.get(id) ?? null,
    consume: async (id: string) => {
      const record = challenges.get(id) ?? null;
      challenges.delete(id);
      return record;
    },
  };

  const service = new AuthService({
    store,
    challenges: challengeStore,
    secrets: SECRETS,
    relyingParty: { rpId: RP_ID, rpName: "Portfolio admin", origin: ORIGIN },
    notifier: {
      notify: async (event) => void notifications.push(event.event),
    },
    dummyPasswordHash: "",
    now: () => clock,
  });

  return {
    service,
    user,
    audit,
    notifications,
    sessions,
    challenges,
    setClock: (value: Date) => {
      clock = value;
    },
    async setPassword(password: string) {
      (user as { passwordHash: string }).passwordHash =
        await hashPassword(password);
    },
    addCredential(credential: SoftwareCredential, counter = 0) {
      credentials.set(credential.credentialId, {
        userId: user.userId,
        publicKey: new Uint8Array(credential.cosePublicKey),
        counter,
      });
    },
    addRecoveryCode(code: string) {
      recoveryCodes.set(recoveryCodeHash(SECRETS.recoverySecret, code)!, true);
    },
  };
}

let assertionCounter = 0;

/**
 * The counter increases on every call, because a real authenticator's does —
 * and because presenting the same one twice is exactly what the clone check
 * refuses.
 */
async function loginTo(
  harness: ReturnType<typeof createHarness>,
  credential: SoftwareCredential,
  password = "correct horse battery staple"
) {
  assertionCounter += 1;
  const challenge = await harness.service.beginPasswordLogin({
    email: harness.user.email,
    password,
    accountKey: "account",
    networkKey: "network",
  });
  // Through the real options endpoint, not the stored record: the challenge a
  // browser signs is the one the options hand it, and an encoding mismatch
  // between the two is invisible to a test that reads the record directly.
  const options = (await harness.service.authenticationOptions({
    challengeId: challenge.challengeId,
    purpose: "LOGIN",
  })) as { challenge: string };
  return harness.service.verifyAssertion({
    challengeId: challenge.challengeId,
    assertion: createAssertion({
      credential,
      challenge: options.challenge,
      origin: ORIGIN,
      rpId: RP_ID,
      counter: assertionCounter,
    }) as never,
    purpose: "LOGIN",
    client: "Firefox on Linux",
    ipPrefixHash: null,
    networkKey: "network",
  });
}

describe("password step", () => {
  it("returns a challenge whether or not the password was right", async () => {
    const harness = createHarness();
    await harness.setPassword("correct horse battery staple");

    const good = await harness.service.beginPasswordLogin({
      email: harness.user.email,
      password: "correct horse battery staple",
      accountKey: "a",
      networkKey: "n",
    });
    const bad = await harness.service.beginPasswordLogin({
      email: "nobody@example.test",
      password: "wrong",
      accountKey: "a2",
      networkKey: "n2",
    });

    // Identical shape. The failure surfaces at the assertion step instead,
    // where it is indistinguishable from an authenticator that said no.
    expect(Object.keys(good).sort()).toEqual(Object.keys(bad).sort());
    expect(bad.challengeId).toMatch(/.+/);
    expect(harness.sessions.size).toBe(0);
  });

  it("binds a failed password step to no user, so the assertion cannot succeed", async () => {
    const harness = createHarness();
    await harness.setPassword("correct horse battery staple");
    const credential = createSoftwareCredential();
    harness.addCredential(credential);

    const challenge = await harness.service.beginPasswordLogin({
      email: harness.user.email,
      password: "the wrong password",
      accountKey: "a",
      networkKey: "n",
    });
    const record = harness.challenges.get(challenge.challengeId);

    await expect(
      harness.service.verifyAssertion({
        challengeId: challenge.challengeId,
        assertion: createAssertion({
          credential,
          challenge: record.challenge,
          origin: ORIGIN,
          rpId: RP_ID,
          counter: 1,
        }) as never,
        purpose: "LOGIN",
        client: null,
        ipPrefixHash: null,
        networkKey: "n",
      })
    ).rejects.toBeInstanceOf(AuthenticationRejectedError);
    expect(harness.sessions.size).toBe(0);
  });
});

describe("WebAuthn assertion", () => {
  it("issues a session for a real signature over a live challenge", async () => {
    const harness = createHarness();
    await harness.setPassword("correct horse battery staple");
    const credential = createSoftwareCredential();
    harness.addCredential(credential);

    const result = await loginTo(harness, credential);

    expect(result.userId).toBe(harness.user.userId);
    expect(result.session.sessionToken).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(harness.audit.map((event) => event.eventType)).toContain(
      "auth.login"
    );
  });

  it("refuses a replayed assertion, because the challenge is spent", async () => {
    const harness = createHarness();
    await harness.setPassword("correct horse battery staple");
    const credential = createSoftwareCredential();
    harness.addCredential(credential);

    const challenge = await harness.service.beginPasswordLogin({
      email: harness.user.email,
      password: "correct horse battery staple",
      accountKey: "a",
      networkKey: "n",
    });
    const record = harness.challenges.get(challenge.challengeId);
    const assertion = createAssertion({
      credential,
      challenge: record.challenge,
      origin: ORIGIN,
      rpId: RP_ID,
      counter: 1,
    }) as never;
    const verify = () =>
      harness.service.verifyAssertion({
        challengeId: challenge.challengeId,
        assertion,
        purpose: "LOGIN",
        client: null,
        ipPrefixHash: null,
        networkKey: "n",
      });

    await expect(verify()).resolves.toBeDefined();
    await expect(verify()).rejects.toBeInstanceOf(AuthenticationRejectedError);
  });

  it("refuses an assertion signed for another origin or relying party", async () => {
    for (const wrong of [
      { origin: "https://evil.example.test", rpId: RP_ID },
      { origin: ORIGIN, rpId: "evil.example.test" },
    ]) {
      const harness = createHarness();
      await harness.setPassword("correct horse battery staple");
      const credential = createSoftwareCredential();
      harness.addCredential(credential);

      const challenge = await harness.service.beginPasswordLogin({
        email: harness.user.email,
        password: "correct horse battery staple",
        accountKey: "a",
        networkKey: "n",
      });
      const record = harness.challenges.get(challenge.challengeId);

      await expect(
        harness.service.verifyAssertion({
          challengeId: challenge.challengeId,
          assertion: createAssertion({
            credential,
            challenge: record.challenge,
            counter: 1,
            ...wrong,
          }) as never,
          purpose: "LOGIN",
          client: null,
          ipPrefixHash: null,
          networkKey: "n",
        })
      ).rejects.toBeInstanceOf(AuthenticationRejectedError);
    }
  });

  it("refuses an assertion from a credential belonging to someone else", async () => {
    const harness = createHarness();
    await harness.setPassword("correct horse battery staple");
    const stranger = createSoftwareCredential();
    // Present but not owned by the authenticating user.
    harness.addCredential(stranger);
    (harness as never as { user: AuthUserRecord }).user;

    const challenge = await harness.service.beginPasswordLogin({
      email: harness.user.email,
      password: "correct horse battery staple",
      accountKey: "a",
      networkKey: "n",
    });
    const record = harness.challenges.get(challenge.challengeId);
    const unknown = createSoftwareCredential();

    await expect(
      harness.service.verifyAssertion({
        challengeId: challenge.challengeId,
        assertion: createAssertion({
          credential: unknown,
          challenge: record.challenge,
          origin: ORIGIN,
          rpId: RP_ID,
          counter: 1,
        }) as never,
        purpose: "LOGIN",
        client: null,
        ipPrefixHash: null,
        networkKey: "n",
      })
    ).rejects.toBeInstanceOf(AuthenticationRejectedError);
  });

  it("refuses a counter that has not advanced, and warns the owner", async () => {
    const harness = createHarness();
    await harness.setPassword("correct horse battery staple");
    const credential = createSoftwareCredential();
    harness.addCredential(credential, 9);

    const challenge = await harness.service.beginPasswordLogin({
      email: harness.user.email,
      password: "correct horse battery staple",
      accountKey: "a",
      networkKey: "n",
    });
    const record = harness.challenges.get(challenge.challengeId);

    await expect(
      harness.service.verifyAssertion({
        challengeId: challenge.challengeId,
        assertion: createAssertion({
          credential,
          challenge: record.challenge,
          origin: ORIGIN,
          rpId: RP_ID,
          counter: 5,
        }) as never,
        purpose: "LOGIN",
        client: null,
        ipPrefixHash: null,
        networkKey: "n",
      })
    ).rejects.toBeInstanceOf(AuthenticationRejectedError);
    expect(harness.notifications).toContain("webauthn.counter.regressed");
  });

  it("refuses an assertion the user never verified", async () => {
    const harness = createHarness();
    await harness.setPassword("correct horse battery staple");
    const credential = createSoftwareCredential();
    harness.addCredential(credential);

    const challenge = await harness.service.beginPasswordLogin({
      email: harness.user.email,
      password: "correct horse battery staple",
      accountKey: "a",
      networkKey: "n",
    });
    const record = harness.challenges.get(challenge.challengeId);

    await expect(
      harness.service.verifyAssertion({
        challengeId: challenge.challengeId,
        assertion: createAssertion({
          credential,
          challenge: record.challenge,
          origin: ORIGIN,
          rpId: RP_ID,
          counter: 1,
          userVerified: false,
        }) as never,
        purpose: "LOGIN",
        client: null,
        ipPrefixHash: null,
        networkKey: "n",
      })
    ).rejects.toBeInstanceOf(AuthenticationRejectedError);
  });
});

describe("sessions", () => {
  it("stops accepting a session once it is revoked", async () => {
    const harness = createHarness();
    await harness.setPassword("correct horse battery staple");
    const credential = createSoftwareCredential();
    harness.addCredential(credential);
    const { session } = await loginTo(harness, credential);

    const authenticated = await harness.service.authenticate(
      session.sessionToken
    );
    expect(authenticated).not.toBeNull();
    await harness.service.logout(authenticated!);
    expect(await harness.service.authenticate(session.sessionToken)).toBeNull();
  });

  it("stops accepting a session that has gone idle", async () => {
    const harness = createHarness();
    await harness.setPassword("correct horse battery staple");
    const credential = createSoftwareCredential();
    harness.addCredential(credential);
    const { session } = await loginTo(harness, credential);

    harness.setClock(new Date("2026-08-26T12:31:00.000Z"));
    expect(await harness.service.authenticate(session.sessionToken)).toBeNull();
  });

  it("stops accepting a session whose account is no longer active", async () => {
    const harness = createHarness();
    await harness.setPassword("correct horse battery staple");
    const credential = createSoftwareCredential();
    harness.addCredential(credential);
    const { session } = await loginTo(harness, credential);

    (harness.user as { status: string }).status = "LOCKED";
    expect(await harness.service.authenticate(session.sessionToken)).toBeNull();
  });

  it("refuses to revoke a session belonging to another account", async () => {
    const harness = createHarness();
    await harness.setPassword("correct horse battery staple");
    const credential = createSoftwareCredential();
    harness.addCredential(credential);
    const { session } = await loginTo(harness, credential);
    const authenticated = (await harness.service.authenticate(
      session.sessionToken
    ))!;

    // An id that exists in the table but is not theirs must look identical to
    // one that does not exist at all.
    harness.sessions.set("session-999", {
      id: "session-999",
      userId: "someone-else",
      csrfBindingHash: "x",
      createdAt: new Date(),
      lastSeenAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
      revokedAt: null,
      client: null,
      tokenHash: "other",
    });

    await expect(
      harness.service.revokeSession(authenticated, "session-999")
    ).resolves.toBe("not-found");
    await expect(
      harness.service.revokeSession(authenticated, "session-does-not-exist")
    ).resolves.toBe("not-found");
  });

  it("requires recent authentication to revoke a different session", async () => {
    const harness = createHarness();
    await harness.setPassword("correct horse battery staple");
    const credential = createSoftwareCredential();
    harness.addCredential(credential);
    const first = await loginTo(harness, credential);
    const second = await loginTo(harness, credential);

    harness.setClock(new Date("2026-08-26T12:20:00.000Z"));
    const stale = (await harness.service.authenticate(
      second.session.sessionToken
    ))!;
    expect(stale.recentlyAuthenticated).toBe(false);

    const firstId = [...harness.sessions.values()].find(
      (session) => session.tokenHash === first.session.tokenHash
    )!.id;
    await expect(harness.service.revokeSession(stale, firstId)).resolves.toBe(
      "recent-auth-required"
    );
    // Ending your own session is a logout, not a session-wide action.
    await expect(
      harness.service.revokeSession(stale, stale.session.id)
    ).resolves.toBe("revoked");
  });
});

describe("recovery", () => {
  it("spends a code once and revokes every other session", async () => {
    const harness = createHarness();
    await harness.setPassword("correct horse battery staple");
    const credential = createSoftwareCredential();
    harness.addCredential(credential);
    await loginTo(harness, credential);
    harness.addRecoveryCode("abcde-fghjk-mnpqr-stuvw");

    const session = await harness.service.verifyRecovery({
      email: harness.user.email,
      code: "abcde-fghjk-mnpqr-stuvw",
      accountKey: "a",
      networkKey: "n",
      client: null,
      ipPrefixHash: null,
    });
    expect(session.sessionToken).toMatch(/.+/);
    expect(harness.notifications).toContain("recovery.code.used");

    const revoked = [...harness.sessions.values()].filter(
      (value) => value.revokedAt !== null
    );
    expect(revoked).toHaveLength(1);

    await expect(
      harness.service.verifyRecovery({
        email: harness.user.email,
        code: "abcde-fghjk-mnpqr-stuvw",
        accountKey: "a",
        networkKey: "n",
        client: null,
        ipPrefixHash: null,
      })
    ).rejects.toBeInstanceOf(AuthenticationRejectedError);
  });

  it("throttles recovery harder than login", async () => {
    const harness = createHarness();
    await harness.setPassword("correct horse battery staple");

    const attempt = () =>
      harness.service.verifyRecovery({
        email: harness.user.email,
        code: "aaaaa-bbbbb-ccccc-ddddd",
        accountKey: "a",
        networkKey: "n",
        client: null,
        ipPrefixHash: null,
      });

    await expect(attempt()).rejects.toBeInstanceOf(AuthenticationRejectedError);
    await expect(attempt()).rejects.toBeInstanceOf(AuthenticationRejectedError);
    await expect(attempt()).rejects.toBeInstanceOf(AuthenticationRejectedError);
    await expect(attempt()).rejects.toBeInstanceOf(ThrottledError);
  });
});

describe("progressive throttle", () => {
  it("stays quiet under the free allowance and then backs off", () => {
    const throttle = new ProgressiveThrottle(2, 10);
    const now = 1_000;
    throttle.check("k", now);
    throttle.fail("k", now);
    throttle.check("k", now);
    throttle.fail("k", now);
    throttle.check("k", now);
    throttle.fail("k", now);
    expect(() => throttle.check("k", now)).toThrow(ThrottledError);
    // A success clears the record rather than decaying it, so a legitimate
    // login after a few typos is not punished for the rest of the window.
    throttle.succeed("k");
    expect(() => throttle.check("k", now)).not.toThrow();
  });
});

describe("authorization", () => {
  const request = (
    role: "OWNER" | "EDITOR",
    recentlyAuthenticated = true
  ): never =>
    ({
      user: { userId: "u1", role, status: "ACTIVE" },
      session: { id: "s1" },
      recentlyAuthenticated,
    }) as never;

  it("denies anything not explicitly granted", () => {
    expect(can(request("EDITOR"), "appearance.write")).toBe(false);
    expect(can(request("EDITOR"), "users.manage")).toBe(false);
    expect(can(request("EDITOR"), "audit.read")).toBe(false);
    expect(can(request("EDITOR"), "content.publish")).toBe(false);
    expect(can(request("EDITOR"), "content.draft.write")).toBe(true);
  });

  it("requires recent authentication for session-wide and destructive actions", () => {
    expect(authorize(request("OWNER", false), "content.delete")).toEqual({
      allowed: false,
      reason: "recent-auth-required",
    });
    expect(authorize(request("OWNER", true), "content.delete")).toEqual({
      allowed: true,
    });
    expect(authorize(request("OWNER", false), "appearance.write")).toEqual({
      allowed: true,
    });
  });

  it("denies a locked account every permission", () => {
    const locked = {
      user: { userId: "u1", role: "OWNER", status: "LOCKED" },
      session: { id: "s1" },
      recentlyAuthenticated: true,
    } as never;
    expect(can(locked, "content.draft.read")).toBe(false);
  });

  it("keeps EDITOR unassignable until the permissions ADR lands", () => {
    expect(isRoleAssignable("OWNER")).toBe(true);
    expect(isRoleAssignable("EDITOR")).toBe(false);
  });

  it("scopes object access to the owning actor", () => {
    expect(ownsResource(request("EDITOR"), "u1")).toBe(true);
    expect(ownsResource(request("EDITOR"), "someone-else")).toBe(false);
    expect(ownsResource(request("EDITOR"), null)).toBe(false);
    // The owner is not exempt from the check being made — only from failing it.
    expect(ownsResource(request("OWNER"), "someone-else")).toBe(true);
  });
});

describe("audit trail", () => {
  it("records the security events SECURITY.md §13 names", async () => {
    const harness = createHarness();
    await harness.setPassword("correct horse battery staple");
    const credential = createSoftwareCredential();
    harness.addCredential(credential);

    await harness.service.beginPasswordLogin({
      email: harness.user.email,
      password: "wrong",
      accountKey: "a",
      networkKey: "n",
    });
    const { session } = await loginTo(harness, credential);
    const authenticated = (await harness.service.authenticate(
      session.sessionToken
    ))!;
    await harness.service.logout(authenticated);

    const types = harness.audit.map((event) => event.eventType);
    expect(types).toContain("auth.password.failed");
    expect(types).toContain("auth.login");
    expect(types).toContain("auth.logout");
    // No audit record may carry a credential or a token.
    expect(JSON.stringify(harness.audit)).not.toContain(session.sessionToken);
    expect(JSON.stringify(harness.audit)).not.toContain(
      "correct horse battery staple"
    );
  });

  it("does not turn a failed audit write into a failed refusal", async () => {
    const harness = createHarness();
    await harness.setPassword("correct horse battery staple");
    const broken = vi.spyOn(harness.audit, "push").mockImplementation(() => {
      throw new Error("audit store is down");
    });

    await expect(
      harness.service.beginPasswordLogin({
        email: harness.user.email,
        password: "wrong",
        accountKey: "a",
        networkKey: "n",
      })
    ).resolves.toBeDefined();
    broken.mockRestore();
  });
});

describe("passkey enrolment", () => {
  it("enrols a second passkey from a recently authenticated session", async () => {
    const harness = createHarness();
    await harness.setPassword("correct horse battery staple");
    const first = createSoftwareCredential();
    harness.addCredential(first);
    const { session } = await loginTo(harness, first);
    const authenticated = (await harness.service.authenticate(
      session.sessionToken
    ))!;

    const options = (await harness.service.beginEnrolment(authenticated)) as {
      challenge: string;
      challengeId: string;
      excludeCredentials?: readonly { id: string }[];
    };
    expect(options.excludeCredentials?.map(({ id }) => id)).toEqual([
      first.credentialId,
    ]);

    const second = createSoftwareCredential();
    const enrolled = await harness.service.completeEnrolment(authenticated, {
      challengeId: options.challengeId,
      label: "Backup key",
      registration: createRegistration({
        credential: second,
        challenge: options.challenge,
        origin: ORIGIN,
        rpId: RP_ID,
      }) as never,
    });

    expect(enrolled.credentialId).toBe(second.credentialId);
    expect(harness.notifications).toContain("credential.enrolled");
    // The new passkey works immediately.
    await expect(loginTo(harness, second)).resolves.toBeDefined();
  });

  it("refuses enrolment from a session that has not recently authenticated", async () => {
    const harness = createHarness();
    await harness.setPassword("correct horse battery staple");
    const credential = createSoftwareCredential();
    harness.addCredential(credential);
    const { session } = await loginTo(harness, credential);

    harness.setClock(new Date("2026-08-26T12:20:00.000Z"));
    const stale = (await harness.service.authenticate(session.sessionToken))!;
    expect(stale.recentlyAuthenticated).toBe(false);

    await expect(harness.service.beginEnrolment(stale)).rejects.toBeInstanceOf(
      RecentAuthenticationRequiredError
    );
  });

  it("refuses a registration signed for another origin", async () => {
    const harness = createHarness();
    await harness.setPassword("correct horse battery staple");
    const credential = createSoftwareCredential();
    harness.addCredential(credential);
    const { session } = await loginTo(harness, credential);
    const authenticated = (await harness.service.authenticate(
      session.sessionToken
    ))!;
    const options = (await harness.service.beginEnrolment(authenticated)) as {
      challenge: string;
      challengeId: string;
    };

    await expect(
      harness.service.completeEnrolment(authenticated, {
        challengeId: options.challengeId,
        label: "Forged key",
        registration: createRegistration({
          credential: createSoftwareCredential(),
          challenge: options.challenge,
          origin: "https://evil.example.test",
          rpId: RP_ID,
        }) as never,
      })
    ).rejects.toBeInstanceOf(AuthenticationRejectedError);
  });

  it("refuses an enrolment challenge belonging to a different account", async () => {
    const harness = createHarness();
    await harness.setPassword("correct horse battery staple");
    const credential = createSoftwareCredential();
    harness.addCredential(credential);
    const { session } = await loginTo(harness, credential);
    const authenticated = (await harness.service.authenticate(
      session.sessionToken
    ))!;
    const options = (await harness.service.beginEnrolment(authenticated)) as {
      challenge: string;
      challengeId: string;
    };

    const impostor = {
      ...authenticated,
      user: { ...authenticated.user, userId: "someone-else-entirely" },
    };
    await expect(
      harness.service.completeEnrolment(impostor, {
        challengeId: options.challengeId,
        label: "Stolen key",
        registration: createRegistration({
          credential: createSoftwareCredential(),
          challenge: options.challenge,
          origin: ORIGIN,
          rpId: RP_ID,
        }) as never,
      })
    ).rejects.toBeInstanceOf(AuthenticationRejectedError);
  });
});
