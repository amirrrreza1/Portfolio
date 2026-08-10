import { describe, expect, it } from "vitest";

import {
  issueSession,
  verifyCsrfToken,
  verifySessionToken,
} from "../src/index.js";

const secrets = { sessionSecret: "s".repeat(32), csrfSecret: "c".repeat(32) };

describe("opaque session primitives", () => {
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
