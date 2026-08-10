import { z } from "zod";

import { type Locale, localeSchema } from "./locale.js";

/**
 * Slug normalization, per
 * [ADR-010](../../../../docs/DECISIONS.md#adr-010--unicode-persian-slugs-are-canonical).
 *
 * English slugs are normalized lowercase ASCII with hyphens. Persian slugs are
 * normalized Persian Unicode letters and digits with ASCII hyphens, stored
 * decoded and percent-encoded only at URL construction.
 *
 * Normalization is one function used by validation, storage, and lookup. If
 * they normalized differently, `(locale, slug)` uniqueness would be enforced
 * over one form while lookups queried another, and two rows that collide in
 * URLs could both be inserted.
 *
 * Every character class below is written with `\u` escapes rather than literal
 * characters. Several of the code points involved are invisible or
 * bidirectional, and a literal in the source would be unreviewable.
 */

/**
 * Arabic code points that render as Persian letters but are distinct
 * characters.
 *
 * This is the classic homograph pair: Arabic kaf (U+0643) and yeh (U+064A) look
 * identical to Persian keheh (U+06A9) and yeh (U+06CC) in most fonts, and both
 * keyboards and copy-paste produce them freely. Without folding, the same
 * Persian word typed on two keyboards yields two different rows that are
 * indistinguishable in the admin list.
 */
const ARABIC_TO_PERSIAN: ReadonlyMap<string, string> = new Map([
  ["\u064A", "\u06CC"], // Arabic yeh -> Persian yeh
  ["\u0649", "\u06CC"], // Alef maksura -> Persian yeh
  ["\u0643", "\u06A9"], // Arabic kaf -> Persian keheh
  ["\u0660", "\u06F0"], // Arabic-Indic digits -> Extended (Persian) digits
  ["\u0661", "\u06F1"],
  ["\u0662", "\u06F2"],
  ["\u0663", "\u06F3"],
  ["\u0664", "\u06F4"],
  ["\u0665", "\u06F5"],
  ["\u0666", "\u06F6"],
  ["\u0667", "\u06F7"],
  ["\u0668", "\u06F8"],
  ["\u0669", "\u06F9"],
]);

/**
 * Zero-width and bidirectional formatting controls.
 *
 * ZWNJ (U+200C) is meaningful in Persian *text* but must not survive into a
 * slug: it is invisible, so two slugs differing only by a ZWNJ look identical
 * to a reader while being distinct database rows. The bidi overrides
 * (U+202A–U+202E, U+2066–U+2069) are worse — they can reorder how a URL
 * displays without changing where it points.
 */
const FORMATTING_CONTROLS =
  /[\u00AD\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/**
 * The Arabic combining marks specifically: the optional diacritics of written
 * Persian. They carry no distinction a URL should depend on, and they are
 * frequently absent when the same word is typed a second time.
 *
 * `ANY_COMBINING_MARK` below subsumes this range. It is kept as documentation
 * of which Persian-specific code points the general rule is removing, since
 * that is not obvious from `\p{M}` alone.
 */
export const ARABIC_COMBINING_MARKS =
  /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;

/**
 * Any Unicode combining mark. Removing all of them in one pass reduces Latin
 * accents to base letters and strips Arabic diacritics with the same rule.
 */
const ANY_COMBINING_MARK = /\p{M}/gu;

/** Persian letters (U+0621–U+06D5) and Extended Arabic-Indic digits. */
const PERSIAN_CHARACTER_CLASS = "\\u0621-\\u06D5\\u06F0-\\u06F9";

const PERSIAN_SLUG_ALLOWED = new RegExp(
  `^[${PERSIAN_CHARACTER_CLASS}a-z0-9-]+$`
);
const PERSIAN_SLUG_DISALLOWED = new RegExp(
  `[^${PERSIAN_CHARACTER_CLASS}a-z0-9]+`,
  "g"
);

const ASCII_SLUG_ALLOWED = /^[a-z0-9-]+$/;
const ASCII_SLUG_DISALLOWED = /[^a-z0-9]+/g;

export const SLUG_MAX_LENGTH = 96;

function foldArabicVariants(value: string): string {
  let result = "";
  for (const character of value) {
    result += ARABIC_TO_PERSIAN.get(character) ?? character;
  }
  return result;
}

/**
 * Normalizes a candidate slug for a locale.
 *
 * Returns the normalized value without judging whether it is valid — an empty
 * string is a legitimate result for input that was entirely punctuation, and
 * the caller decides whether that is an error or a prompt to ask the author.
 */
export function normalizeSlug(input: string, locale: Locale): string {
  // NFKD first. Compatibility decomposition does three useful things at once:
  // it separates accented Latin letters from their marks so "café" can reduce
  // to "cafe" rather than losing the "é" entirely; it folds fullwidth and
  // other compatibility variants to plain ASCII; and it maps Arabic
  // presentation forms (U+FB50–U+FDFF, U+FE70–U+FEFF) back to their base
  // letters, which is another homograph vector closed. Persian and
  // Arabic-Indic digits have no decomposition and pass through untouched.
  let value = input.normalize("NFKD");

  value = value.replace(FORMATTING_CONTROLS, "");

  // Every combining mark goes, which covers Latin accents and the optional
  // Arabic diacritics of written Persian in one pass. ARABIC_COMBINING_MARKS
  // stays defined below as the documented subset this subsumes.
  value = value.replace(ANY_COMBINING_MARK, "");

  if (locale === "fa") {
    value = foldArabicVariants(value);
  }

  value = value.toLowerCase();

  // Recompose. Storage is NFC per ADR-010, and with marks already removed the
  // composition is stable, so normalizing again is a no-op.
  value = value.normalize("NFC");

  // Anything outside the allowed set becomes a separator rather than being
  // dropped, so "react/next" becomes "react-next" and not "reactnext".
  value = value.replace(
    locale === "fa" ? PERSIAN_SLUG_DISALLOWED : ASCII_SLUG_DISALLOWED,
    "-"
  );

  value = value.replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "");

  // Truncation can leave a trailing hyphen, so trim again afterwards.
  return value.slice(0, SLUG_MAX_LENGTH).replace(/-+$/g, "");
}

/**
 * `true` when the value is already in canonical form for its locale.
 *
 * Storage and lookup both call `normalizeSlug` first, so this is what catches a
 * slug written directly into the database or arriving from a path that skipped
 * normalization.
 */
export function isCanonicalSlug(value: string, locale: Locale): boolean {
  if (value.length === 0 || value.length > SLUG_MAX_LENGTH) return false;

  const pattern = locale === "fa" ? PERSIAN_SLUG_ALLOWED : ASCII_SLUG_ALLOWED;
  if (!pattern.test(value)) return false;
  if (value.startsWith("-") || value.endsWith("-")) return false;
  if (value.includes("--")) return false;

  return normalizeSlug(value, locale) === value;
}

/**
 * Percent-encodes a stored slug for use in a URL.
 *
 * The stored value is decoded Unicode (ADR-010); encoding happens at URL
 * construction so database values stay readable and directly comparable.
 */
export function encodeSlugForUrl(slug: string): string {
  return encodeURIComponent(slug);
}

/**
 * Validates an already-normalized slug for a locale.
 *
 * Rejects rather than silently normalizing. A slug is part of a URL and of the
 * redirect history, so quietly changing what the author typed would publish a
 * canonical URL they never chose.
 */
export function slugSchemaFor(locale: Locale) {
  return z
    .string()
    .min(1)
    .max(SLUG_MAX_LENGTH)
    .refine((value) => isCanonicalSlug(value, locale), {
      message:
        locale === "fa"
          ? "Must be a normalized Persian slug: Persian letters or digits and ASCII hyphens, NFC, with no leading, trailing, or repeated hyphens."
          : "Must be a normalized ASCII slug: lowercase letters, digits, and single hyphens, with no leading or trailing hyphen.",
    });
}

/** A `(locale, slug)` pair, which is the uniqueness scope for every slug. */
export const localizedSlugSchema = z
  .object({
    locale: localeSchema,
    slug: z.string().min(1).max(SLUG_MAX_LENGTH),
  })
  .refine(({ locale, slug }) => isCanonicalSlug(slug, locale), {
    message: "Slug is not in canonical form for its locale.",
    path: ["slug"],
  });

export type LocalizedSlug = z.infer<typeof localizedSlugSchema>;

/**
 * Result of generating a slug from a title, for the M2 migration and the M8
 * editor.
 *
 * `changed` is reported rather than assumed: the migration must show the owner
 * every generated slug for review instead of silently coercing, and the editor
 * should tell an author when their title did not survive normalization intact.
 */
export interface SlugSuggestion {
  readonly slug: string;
  readonly changed: boolean;
  readonly empty: boolean;
}

export function suggestSlug(title: string, locale: Locale): SlugSuggestion {
  const slug = normalizeSlug(title, locale);
  return {
    slug,
    changed: slug !== title,
    empty: slug.length === 0,
  };
}
