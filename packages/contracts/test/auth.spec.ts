import { describe, expect, it } from "vitest";

import {
  loginRequestSchema,
  ownerProvisioningSchema,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordChangeSchema,
  passwordSchema,
  recoveryCodeSchema,
} from "../src/auth/credentials.js";
import {
  CSRF_COOKIE_NAME,
  csrfTokenSchema,
  SESSION_ABSOLUTE_TIMEOUT_HOURS,
  SESSION_COOKIE_NAME,
  SESSION_IDLE_TIMEOUT_MINUTES,
  sessionActorSchema,
  webAuthnAssertionSchema,
} from "../src/auth/session.js";

describe("password policy", () => {
  it("accepts a long passphrase with no composition tricks", () => {
    // Length over composition: requiring a symbol produces "Password1!",
    // which constrains the search space rather than expanding it.
    expect(
      passwordSchema.safeParse("correct horse battery staple").success
    ).toBe(true);
  });

  it(`rejects anything shorter than ${PASSWORD_MIN_LENGTH}`, () => {
    expect(
      passwordSchema.safeParse("a".repeat(PASSWORD_MIN_LENGTH - 1)).success
    ).toBe(false);
    expect(
      passwordSchema.safeParse("a".repeat(PASSWORD_MIN_LENGTH)).success
    ).toBe(true);
  });

  it("bounds the maximum to prevent a hashing denial of service", () => {
    // Argon2id at 64 MiB is expensive by design, so an unbounded input is a
    // cheap way to make the server do expensive work.
    expect(
      passwordSchema.safeParse("a".repeat(PASSWORD_MAX_LENGTH + 1)).success
    ).toBe(false);
  });

  it("rejects a password that is only whitespace", () => {
    expect(passwordSchema.safeParse(" ".repeat(20)).success).toBe(false);
  });

  it("rejects a trivially common password of adequate length", () => {
    expect(passwordSchema.safeParse("passwordpassword").success).toBe(false);
    expect(passwordSchema.safeParse("PasswordPassword").success).toBe(false);
  });

  it("normalizes to NFC before measuring length", () => {
    // Without this, the same passphrase typed with combining marks hashes
    // differently than the precomposed form, and the user is locked out by
    // their own keyboard.
    const decomposed = "café café café".normalize("NFD");
    const composed = "café café café".normalize("NFC");

    const a = passwordSchema.parse(decomposed);
    const b = passwordSchema.parse(composed);

    expect(a).toBe(b);
  });
});

describe("loginRequestSchema", () => {
  it("accepts a credential pair", () => {
    expect(
      loginRequestSchema.safeParse({
        email: "Owner@Example.COM",
        password: "correct horse battery staple",
      }).success
    ).toBe(true);
  });

  it("normalizes the email domain only", () => {
    const result = loginRequestSchema.parse({
      email: "Owner@Example.COM",
      password: "correct horse battery staple",
    });
    expect(result.email).toBe("Owner@example.com");
  });

  it("does not apply the password policy at login", () => {
    // A user whose password predates a policy change must still be able to log
    // in; the policy applies when setting a password, not when checking one.
    expect(
      loginRequestSchema.safeParse({ email: "a@b.com", password: "short" })
        .success
    ).toBe(true);
  });

  it("rejects an unknown field", () => {
    expect(
      loginRequestSchema.safeParse({
        email: "a@b.com",
        password: "correct horse battery staple",
        role: "OWNER",
      }).success
    ).toBe(false);
  });
});

describe("passwordChangeSchema", () => {
  it("rejects reusing the current password", () => {
    const same = "correct horse battery staple";
    expect(
      passwordChangeSchema.safeParse({
        currentPassword: same,
        newPassword: same,
      }).success
    ).toBe(false);
  });

  it("applies the policy to the new password only", () => {
    expect(
      passwordChangeSchema.safeParse({
        currentPassword: "old",
        newPassword: "a brand new long passphrase",
      }).success
    ).toBe(true);
  });
});

describe("ownerProvisioningSchema", () => {
  it("requires a bootstrap token", () => {
    expect(
      ownerProvisioningSchema.safeParse({
        email: "a@b.com",
        displayName: "Amir",
        password: "a brand new long passphrase",
      }).success
    ).toBe(false);
  });

  it("rejects a short bootstrap token", () => {
    expect(
      ownerProvisioningSchema.safeParse({
        email: "a@b.com",
        displayName: "Amir",
        password: "a brand new long passphrase",
        bootstrapToken: "short",
      }).success
    ).toBe(false);
  });
});

describe("recoveryCodeSchema", () => {
  it("accepts a grouped code and strips the separators", () => {
    // Someone reading a code off paper should not fail because of a hyphen.
    expect(recoveryCodeSchema.parse("abcde-fghij-klmno-pqrst")).toBe(
      "abcdefghijklmnopqrst"
    );
  });

  it("accepts an ungrouped code", () => {
    expect(recoveryCodeSchema.parse("abcdefghijklmnopqrst")).toBe(
      "abcdefghijklmnopqrst"
    );
  });

  it("is case-insensitive", () => {
    expect(recoveryCodeSchema.parse("ABCDE-FGHIJ-KLMNO-PQRST")).toBe(
      "abcdefghijklmnopqrst"
    );
  });

  it("rejects the wrong length", () => {
    expect(recoveryCodeSchema.safeParse("abcde-fghij").success).toBe(false);
  });

  it("rejects non-alphanumeric characters", () => {
    expect(
      recoveryCodeSchema.safeParse("abcde-fghij-klmno-pqrs!").success
    ).toBe(false);
  });
});

describe("session contracts", () => {
  it("uses __Host- prefixed cookie names", () => {
    // The browser enforces Secure, Path=/, and no Domain for __Host-, which
    // closes subdomain session fixation without server-side discipline.
    expect(SESSION_COOKIE_NAME.startsWith("__Host-")).toBe(true);
    expect(CSRF_COOKIE_NAME.startsWith("__Host-")).toBe(true);
  });

  it("sets both an idle and an absolute timeout", () => {
    expect(SESSION_IDLE_TIMEOUT_MINUTES).toBeGreaterThan(0);
    expect(SESSION_ABSOLUTE_TIMEOUT_HOURS).toBeGreaterThan(0);
    expect(SESSION_IDLE_TIMEOUT_MINUTES).toBeLessThan(
      SESSION_ABSOLUTE_TIMEOUT_HOURS * 60
    );
  });

  it("never carries a session token in the actor payload", () => {
    // A token in a response body is readable by any script that can reach the
    // response, which is exactly what HttpOnly exists to prevent.
    const keys = Object.keys(sessionActorSchema.shape);
    expect(keys).not.toContain("token");
    expect(keys).not.toContain("sessionToken");
    expect(keys).not.toContain("tokenHash");
  });

  it("rejects a CSRF token with non-base64url characters", () => {
    expect(csrfTokenSchema.safeParse("a".repeat(40)).success).toBe(true);
    expect(csrfTokenSchema.safeParse(`${"a".repeat(40)}+/=`).success).toBe(
      false
    );
  });

  it("rejects a short CSRF token", () => {
    expect(csrfTokenSchema.safeParse("abc").success).toBe(false);
  });
});

describe("webAuthnAssertionSchema", () => {
  const assertion = {
    id: "credential-id",
    rawId: "cmF3SWQ",
    type: "public-key",
    response: {
      clientDataJSON: "eyJ0eXBlIjoid2ViYXV0aG4uZ2V0In0",
      authenticatorData: "YXV0aERhdGE",
      signature: "c2ln",
    },
  };

  it("accepts a well-formed assertion", () => {
    expect(webAuthnAssertionSchema.safeParse(assertion).success).toBe(true);
  });

  it("rejects a type other than public-key", () => {
    expect(
      webAuthnAssertionSchema.safeParse({ ...assertion, type: "password" })
        .success
    ).toBe(false);
  });

  it("rejects an assertion missing its signature", () => {
    expect(
      webAuthnAssertionSchema.safeParse({
        ...assertion,
        response: { ...assertion.response, signature: undefined },
      }).success
    ).toBe(false);
  });

  it("rejects unknown top-level fields", () => {
    expect(
      webAuthnAssertionSchema.safeParse({ ...assertion, verified: true })
        .success
    ).toBe(false);
  });
});
