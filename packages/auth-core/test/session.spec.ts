import { describe, expect, it } from "vitest";

import {
  authorizeCookieMutation,
  hashPassword,
  issueSession,
  PasswordLoginService,
  verifyCsrfToken,
  verifyPasswordHash,
  verifySessionToken,
} from "../src/index.js";

const secrets = { sessionSecret: "s".repeat(32), csrfSecret: "c".repeat(32) };

describe("opaque session primitives", () => {
  it("requires same-origin, session-bound CSRF for cookie mutations", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const issued = issueSession(secrets, now);
    const input = {
      origin: "https://portfolio.example",
      expectedOrigin: "https://portfolio.example",
      secFetchSite: "same-origin",
      csrfToken: issued.csrfToken,
      csrfSecret: secrets.csrfSecret,
      csrfBindingHash: issued.csrfBindingHash,
      session: {
        expiresAt: issued.expiresAt,
        lastSeenAt: now,
        revokedAt: null,
      },
      now,
    };
    expect(authorizeCookieMutation(input)).toBe(true);
    expect(
      authorizeCookieMutation({ ...input, origin: "https://evil.example" })
    ).toBe(false);
    expect(
      authorizeCookieMutation({ ...input, secFetchSite: "same-site" })
    ).toBe(false);
    expect(
      authorizeCookieMutation({ ...input, csrfToken: "wrong-token" })
    ).toBe(false);
  });

  it("uses Argon2id and rejects malformed or wrong credentials", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(
      verifyPasswordHash("correct horse battery staple", hash)
    ).resolves.toBe(true);
    await expect(verifyPasswordHash("wrong password", hash)).resolves.toBe(
      false
    );
    await expect(
      verifyPasswordHash("wrong password", "not-a-hash")
    ).resolves.toBe(false);
  });

  it("performs a dummy verification and never exposes account existence", async () => {
    const passwordHash = await hashPassword("correct horse battery staple");
    const dummyHash = await hashPassword("unrelated dummy password");
    const created: unknown[] = [];
    const service = new PasswordLoginService(
      {
        findByEmail: async (email) =>
          email === "owner@example.com"
            ? { userId: "user-1", passwordHash, status: "ACTIVE" }
            : null,
        createSession: async (value) => void created.push(value),
        recordSuccessfulPasswordLogin: async () => undefined,
      },
      secrets,
      dummyHash
    );
    await expect(
      service.authenticate({
        email: "missing@example.com",
        password: "wrong password",
      })
    ).resolves.toEqual({ outcome: "FAILED" });
    await expect(
      service.authenticate({
        email: "owner@example.com",
        password: "correct horse battery staple",
      })
    ).resolves.toMatchObject({ outcome: "PASSWORD_VERIFIED" });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ userId: "user-1" });
  });

  it("issues random cookie-only tokens while retaining only keyed hashes", () => {
    const session = issueSession(secrets, new Date("2026-01-01T00:00:00Z"));
    expect(session.sessionToken).toHaveLength(43);
    expect(session.tokenHash).not.toContain(session.sessionToken);
    expect(
      verifySessionToken(
        secrets.sessionSecret,
        session.sessionToken,
        session.tokenHash
      )
    ).toBe(true);
    expect(
      verifyCsrfToken(
        secrets.csrfSecret,
        session.csrfToken,
        session.csrfBindingHash
      )
    ).toBe(true);
  });

  it("rejects cross-session tokens and shared secrets", () => {
    const first = issueSession(secrets);
    const second = issueSession(secrets);
    expect(
      verifySessionToken(
        secrets.sessionSecret,
        second.sessionToken,
        first.tokenHash
      )
    ).toBe(false);
    expect(
      verifyCsrfToken(
        secrets.csrfSecret,
        second.csrfToken,
        first.csrfBindingHash
      )
    ).toBe(false);
    expect(() =>
      issueSession({
        sessionSecret: "x".repeat(32),
        csrfSecret: "x".repeat(32),
      })
    ).toThrow(/Independent/);
  });
});
