import { z } from "zod";

import { normalizedEmailSchema } from "../common/values.js";

/**
 * Password and credential contracts, per
 * [SECURITY.md](../../../../docs/SECURITY.md) §3.
 *
 * The policy here is length and breach checking, deliberately **not**
 * composition rules. Requiring an uppercase letter, a digit, and a symbol
 * produces `Password1!` — it constrains the search space rather than expanding
 * it, and it pushes people towards patterns an attacker's rules already cover.
 * Length plus a breach check is what actually correlates with resistance.
 */

/**
 * 12 characters, not 8.
 *
 * NIST permits 8 as a floor; 12 is chosen because this protects a single
 * owner account with full content-mutation rights and no realistic support
 * path for a compromise.
 */
export const PASSWORD_MIN_LENGTH = 12;

/**
 * Bounded to prevent a hashing denial of service. Argon2id at a 64 MiB
 * memory-hard profile is expensive by design, so an unbounded input is a
 * cheap way for an attacker to make the server do expensive work.
 */
export const PASSWORD_MAX_LENGTH = 256;

/**
 * A minimal set of passwords that no length rule catches.
 *
 * The real check is a breached-password lookup performed server-side; this
 * list exists so the obvious cases fail at the contract boundary without a
 * network round trip. It is not a substitute for the lookup.
 */
const TRIVIAL_PASSWORDS = new Set([
  "password1234",
  "passwordpassword",
  "123456789012",
  "qwertyuiopas",
  "administrator",
  "letmeinplease",
]);

export const passwordSchema = z
  .string()
  // Normalized before length is measured. Without NFC, a password typed with
  // combining marks would have a different length and a different hash than
  // the same password typed with precomposed characters, and the user would
  // be locked out by their own keyboard.
  .transform((value) => value.normalize("NFC"))
  .refine((value) => value.length >= PASSWORD_MIN_LENGTH, {
    message: `Must be at least ${PASSWORD_MIN_LENGTH} characters.`,
  })
  .refine((value) => value.length <= PASSWORD_MAX_LENGTH, {
    message: `Must be at most ${PASSWORD_MAX_LENGTH} characters.`,
  })
  .refine((value) => !TRIVIAL_PASSWORDS.has(value.toLowerCase()), {
    message: "That password is too common.",
  })
  // A password that is only whitespace passes a length check and is
  // unrecoverable by the person who set it.
  .refine((value) => value.trim().length > 0, {
    message: "Must not be only whitespace.",
  });

export const loginRequestSchema = z
  .object({
    email: normalizedEmailSchema,
    password: z
      .string()
      .min(1)
      .max(PASSWORD_MAX_LENGTH)
      .transform((value) => value.normalize("NFC")),
  })
  .strict();

export type LoginRequest = z.infer<typeof loginRequestSchema>;

/**
 * The response to a password step.
 *
 * Deliberately uniform whether the account exists, the password was wrong, or
 * the account is locked: a distinguishable answer is a user-enumeration
 * oracle. The server takes the same amount of work in every case, including
 * hashing a dummy password when no user was found, so timing does not leak
 * what the response body refuses to.
 *
 * A successful password step does not produce a session — it produces a
 * short-lived challenge for the WebAuthn step (SECURITY.md §3).
 */
export const loginChallengeSchema = z.object({
  challengeId: z.string().min(1),
  expiresAt: z.string().min(1),
});

export type LoginChallenge = z.infer<typeof loginChallengeSchema>;

/**
 * One-time owner provisioning.
 *
 * Public self-registration MUST NOT exist (SECURITY.md §3). This is the
 * payload for the deployment command, not for an HTTP endpoint, and the
 * bootstrap token expires.
 */
export const ownerProvisioningSchema = z
  .object({
    email: normalizedEmailSchema,
    displayName: z.string().trim().min(1).max(120),
    password: passwordSchema,
    bootstrapToken: z.string().min(32),
  })
  .strict();

export type OwnerProvisioning = z.infer<typeof ownerProvisioningSchema>;

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
    newPassword: passwordSchema,
  })
  .strict()
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: "The new password must differ from the current one.",
    path: ["newPassword"],
  });

export type PasswordChange = z.infer<typeof passwordChangeSchema>;

/**
 * Recovery codes: high entropy, single use, hashed at rest, shown once.
 *
 * Formatted in groups for transcription. The separator is stripped before
 * comparison so a person reading one off paper cannot fail because of a
 * hyphen.
 */
export const RECOVERY_CODE_GROUPS = 4;
export const RECOVERY_CODE_GROUP_LENGTH = 5;

export const recoveryCodeSchema = z
  .string()
  .trim()
  .transform((value) => value.toLowerCase().replace(/[\s-]/g, ""))
  .refine(
    (value) =>
      value.length === RECOVERY_CODE_GROUPS * RECOVERY_CODE_GROUP_LENGTH,
    { message: "Recovery codes are 20 characters." }
  )
  .refine((value) => /^[a-z0-9]+$/.test(value), {
    message: "Recovery codes contain only letters and digits.",
  });

export const recoveryRequestSchema = z
  .object({
    email: normalizedEmailSchema,
    code: recoveryCodeSchema,
  })
  .strict();

export type RecoveryRequest = z.infer<typeof recoveryRequestSchema>;
