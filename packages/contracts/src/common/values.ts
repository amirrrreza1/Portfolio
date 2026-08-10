import { z } from "zod";

/**
 * Shared scalar value objects: timestamps, colours, URLs, sort order, and
 * trimmed text.
 *
 * These exist once so the same rule cannot be enforced two different ways in
 * two different resources. A colour that is valid for a skill and invalid for a
 * category would be a defect nobody notices until a render breaks.
 */

/** ISO 8601 UTC instant ([API_SPEC.md](../../../../docs/API_SPEC.md) §1). */
export const isoTimestampSchema = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Must be an ISO 8601 date-time string.",
  });

export type IsoTimestamp = z.infer<typeof isoTimestampSchema>;

/** Calendar date with no time component, used for `issuedAt` and similar. */
export const isoDateSchema = z
  .string()
  .trim()
  .regex(
    /^\d{4}-\d{2}-\d{2}$/,
    "Must be an ISO 8601 calendar date (YYYY-MM-DD)."
  )
  .refine((value) => {
    // Indexed rather than destructured: `noUncheckedIndexedAccess` widens
    // destructured array elements to `| undefined`, and the regex above has
    // already guaranteed three numeric segments.
    const parts = value.split("-");
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    // Date.UTC rolls 2024-02-30 forward into March without complaint, so the
    // round trip is what actually rejects an impossible calendar date.
    return (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    );
  }, "Must be a real calendar date.");

export type IsoDate = z.infer<typeof isoDateSchema>;

/**
 * Six-digit hex colour ([DATA_MODEL.md](../../../../docs/DATA_MODEL.md) §2).
 *
 * Three-digit shorthand and named colours are rejected, so stored values are
 * directly comparable and the contrast checker has exactly one form to parse.
 * Contrast itself is checked against every enabled theme at write time; that
 * needs the theme registry and belongs to the appearance module, not here.
 */
export const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-f]{6}$/i, "Must be a six-digit hex colour such as #1a2b3c.")
  .transform((value) => value.toLowerCase());

export type HexColor = z.infer<typeof hexColorSchema>;

/**
 * Protocols that may appear in stored content.
 *
 * An allowlist rather than a denylist. `javascript:` and `data:` are the
 * obvious exclusions, but the reason for an allowlist is the ones nobody thinks
 * to deny — `vbscript:`, `blob:`, `filesystem:`, and whatever a future browser
 * adds. A denylist is only ever as current as the last person who edited it.
 */
export const SAFE_URL_PROTOCOLS = ["https:", "http:"] as const;

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/**
 * Absolute `https` URL.
 *
 * [DATA_MODEL.md](../../../../docs/DATA_MODEL.md) §2 requires absolute `https`
 * for stored external URLs. `http` is accepted only where a spec explicitly
 * allows it; nothing currently does, so it is off by default.
 */
export const httpsUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .superRefine((value, ctx) => {
    const url = parseUrl(value);

    if (url === null) {
      ctx.addIssue({ code: "custom", message: "Must be an absolute URL." });
      return;
    }

    if (url.protocol !== "https:") {
      ctx.addIssue({
        code: "custom",
        message: `Must use https, received "${url.protocol}".`,
      });
    }

    // Credentials in a stored URL leak into logs, referrers, and revision
    // snapshots, and there is no legitimate reason for content to carry them.
    if (url.username.length > 0 || url.password.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: "Must not contain embedded credentials.",
      });
    }
  });

export type HttpsUrl = z.infer<typeof httpsUrlSchema>;

/** `mailto:` address, permitted only for `SocialLink.kind = EMAIL`. */
export const mailtoUrlSchema = z
  .string()
  .trim()
  .max(320)
  .superRefine((value, ctx) => {
    const url = parseUrl(value);

    if (url === null || url.protocol !== "mailto:") {
      ctx.addIssue({ code: "custom", message: "Must be a mailto: URL." });
      return;
    }

    if (!/^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(url.pathname)) {
      ctx.addIssue({
        code: "custom",
        message: "Must contain a single valid email address.",
      });
    }
  });

/**
 * Site-relative path, used for `NavItem.target` with
 * `targetKind = INTERNAL_ROUTE`.
 *
 * Rejecting protocol-relative `//evil.example` matters as much as rejecting
 * absolute URLs: a browser treats `//host` as an absolute URL, so allowing it
 * would turn the header into an off-site redirect surface — exactly what
 * [DATA_MODEL.md](../../../../docs/DATA_MODEL.md) §4 forbids.
 */
export const internalPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .superRefine((value, ctx) => {
    if (!value.startsWith("/")) {
      ctx.addIssue({ code: "custom", message: "Must start with /." });
      return;
    }

    if (value.startsWith("//") || value.startsWith("/\\")) {
      ctx.addIssue({
        code: "custom",
        message: "Must not be a protocol-relative URL.",
      });
      return;
    }

    if (value.includes("..")) {
      ctx.addIssue({
        code: "custom",
        message: "Must not contain a parent-directory segment.",
      });
    }

    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001F\u007F]/.test(value)) {
      ctx.addIssue({
        code: "custom",
        message: "Must not contain control characters.",
      });
    }
  });

export type InternalPath = z.infer<typeof internalPathSchema>;

/**
 * Non-empty text after trimming, with a normalized interior.
 *
 * `DATA_MODEL.md` §8 requires a check for non-empty trimmed titles. Collapsing
 * interior whitespace as well means a title pasted with a newline in it does
 * not become a value that renders differently everywhere it appears.
 */
export function trimmedTextSchema(options: {
  readonly min?: number;
  readonly max: number;
}) {
  const { min = 1, max } = options;

  return z
    .string()
    .transform((value) => value.normalize("NFC").replace(/\s+/g, " ").trim())
    .refine((value) => value.length >= min, {
      message: `Must be at least ${min} character${min === 1 ? "" : "s"} after trimming.`,
    })
    .refine((value) => value.length <= max, {
      message: `Must be at most ${max} characters.`,
    });
}

/**
 * Multi-line text that preserves paragraph breaks.
 *
 * Line endings are normalized to LF and runs of blank lines collapse to one, so
 * the same prose pasted from different editors stores identically.
 */
export function multilineTextSchema(options: {
  readonly min?: number;
  readonly max: number;
}) {
  const { min = 1, max } = options;

  return z
    .string()
    .transform((value) =>
      value
        .normalize("NFC")
        .replace(/\r\n?/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
    )
    .refine((value) => value.length >= min, {
      message: `Must be at least ${min} character${min === 1 ? "" : "s"} after trimming.`,
    })
    .refine((value) => value.length <= max, {
      message: `Must be at most ${max} characters.`,
    });
}

/**
 * Manual ordering position.
 *
 * Bounded and non-negative, per the sensible-sort-order check in
 * `DATA_MODEL.md` §8.
 */
export const sortOrderSchema = z.int().min(0).max(10_000);

export type SortOrder = z.infer<typeof sortOrderSchema>;

/**
 * Normalized email address for storage and uniqueness.
 *
 * Only the domain is lowercased. The local part is case-sensitive per RFC 5321,
 * and while most providers ignore that, silently rewriting the part before the
 * `@` changes an address the owner may have entered deliberately.
 */
export const normalizedEmailSchema = z
  .string()
  .trim()
  .max(320)
  .refine((value) => /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(value), {
    message: "Must be a valid email address.",
  })
  .transform((value) => {
    const at = value.lastIndexOf("@");
    return `${value.slice(0, at)}@${value.slice(at + 1).toLowerCase()}`;
  });

export type NormalizedEmail = z.infer<typeof normalizedEmailSchema>;
