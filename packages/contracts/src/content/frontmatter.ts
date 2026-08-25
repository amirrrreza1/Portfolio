import { z } from "zod";

import {
  mediaAssetIdSchema,
  postIdSchema,
  stableKeySchema,
} from "../common/ids.js";
import { localeSchema } from "../common/locale.js";
import { isCanonicalSlug, SLUG_MAX_LENGTH } from "../common/slug.js";
import {
  httpsUrlSchema,
  isoTimestampSchema,
  trimmedTextSchema,
} from "../common/values.js";

/**
 * The frontmatter contract from
 * [CONTENT_PIPELINE.md](../../../../docs/CONTENT_PIPELINE.md) §3.
 *
 * This is the single validation point every authoring path converges on: the
 * admin editor, the `.md`/`.mdx` import, and deterministic export. That is the
 * whole reason it lives in a shared contracts package rather than in whichever
 * module happens to parse the file — three paths validating three different
 * ways is three different sets of publishable content.
 *
 * PostgreSQL persists the validated metadata as realized state. Frontmatter is
 * a portable import/export envelope rather than another authoritative store.
 */

/**
 * Supported schema versions.
 *
 * An unsupported version blocks import rather than guessing. A file written by a
 * future version of the pipeline may use fields this build does not
 * understand, and interpreting it partially would publish something the author
 * did not write.
 */
export const SUPPORTED_FRONTMATTER_VERSIONS = [1] as const;

export const CURRENT_FRONTMATTER_VERSION = 1;

export const frontmatterSchemaVersionSchema = z
  .literal(SUPPORTED_FRONTMATTER_VERSIONS)
  .describe("Supported frontmatter schema version");

export const translationStatusSchema = z.enum([
  "draft",
  "scheduled",
  "published",
  "archived",
]);

export type TranslationStatusValue = z.infer<typeof translationStatusSchema>;

export const TITLE_MAX_LENGTH = 200;
export const EXCERPT_MAX_LENGTH = 400;
export const SEO_TITLE_MAX_LENGTH = 70;
export const SEO_DESCRIPTION_MAX_LENGTH = 160;
export const MAX_TAGS = 10;

/**
 * A slug whose locale is not yet known.
 *
 * Locale-specific canonical form is checked in the object-level refinement
 * below, once `locale` has been read from the same document. Checking it here
 * would mean guessing which alphabet is allowed.
 */
const rawSlugSchema = z.string().trim().min(1).max(SLUG_MAX_LENGTH);

/**
 * `.strict()` matters more here than anywhere else in this package: an unknown
 * key means the file was written against a different contract, and silently
 * ignoring it is how an author's `draft: true` gets published because the
 * field was actually called `status`.
 */
export const frontmatterSchema = z
  .object({
    schemaVersion: frontmatterSchemaVersionSchema,
    postId: postIdSchema,
    locale: localeSchema,

    title: trimmedTextSchema({ max: TITLE_MAX_LENGTH }),
    slug: rawSlugSchema,
    excerpt: trimmedTextSchema({ max: EXCERPT_MAX_LENGTH }),

    status: translationStatusSchema,
    publishedAt: isoTimestampSchema.nullable().default(null),
    scheduledFor: isoTimestampSchema.nullable().default(null),
    updatedAt: isoTimestampSchema.nullable().default(null),

    category: stableKeySchema.nullable().default(null),
    tags: z.array(stableKeySchema).max(MAX_TAGS).default([]),

    coverImage: mediaAssetIdSchema.nullable().default(null),
    coverImageAlt: z.string().trim().max(300).nullable().default(null),

    seoTitle: trimmedTextSchema({ max: SEO_TITLE_MAX_LENGTH })
      .nullable()
      .default(null),
    seoDescription: trimmedTextSchema({ max: SEO_DESCRIPTION_MAX_LENGTH })
      .nullable()
      .default(null),
    canonicalUrl: httpsUrlSchema.nullable().default(null),
    socialImage: mediaAssetIdSchema.nullable().default(null),

    /** The post this is a translation of. Reserved; currently always null. */
    translationOf: postIdSchema.nullable().default(null),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!isCanonicalSlug(value.slug, value.locale)) {
      ctx.addIssue({
        code: "custom",
        path: ["slug"],
        message: `Slug is not in canonical form for locale "${value.locale}".`,
      });
    }

    // The same invariants the database CHECK constraint enforces. Both exist
    // deliberately: this one gives the author a line-referenced error in the
    // editor, and the constraint catches the path that skipped this.
    if (value.status === "published" && value.publishedAt === null) {
      ctx.addIssue({
        code: "custom",
        path: ["publishedAt"],
        message: "A published article requires publishedAt.",
      });
    }

    if (value.status === "scheduled") {
      if (value.scheduledFor === null) {
        ctx.addIssue({
          code: "custom",
          path: ["scheduledFor"],
          message: "A scheduled article requires scheduledFor.",
        });
      }

      if (value.publishedAt !== null) {
        ctx.addIssue({
          code: "custom",
          path: ["publishedAt"],
          message: "A scheduled article must not carry publishedAt.",
        });
      }
    }

    if (value.status === "draft" && value.publishedAt !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["publishedAt"],
        message: "A draft must not carry publishedAt.",
      });
    }

    // An informative cover image requires alt text. A decorative image would
    // take an empty alt attribute, but a blog cover is never decorative — it
    // is the image the article is announced with.
    if (value.coverImage !== null && !value.coverImageAlt?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["coverImageAlt"],
        message: "A cover image requires alt text.",
      });
    }

    const uniqueTags = new Set(value.tags);
    if (uniqueTags.size !== value.tags.length) {
      ctx.addIssue({
        code: "custom",
        path: ["tags"],
        message: "Tags must be unique.",
      });
    }
  });

export type Frontmatter = z.infer<typeof frontmatterSchema>;

/**
 * Checks the frontmatter against the file's own location.
 *
 * `postId` MUST match the containing directory and `locale` MUST match the
 * filename. This is what stops a copy-pasted file from overwriting the article
 * it was copied from: the path says one thing, the frontmatter says another,
 * and without this check the frontmatter wins.
 */
export interface ContentPath {
  readonly postId: string;
  readonly locale: string;
}

/** `content/blog/<postId>/<locale>.md` */
const CONTENT_PATH = /^content\/blog\/([^/]+)\/([^/]+)\.mdx?$/;

export function parseContentPath(filePath: string): ContentPath | null {
  const match = CONTENT_PATH.exec(filePath);
  if (match === null) return null;

  const [, postId, locale] = match;
  if (postId === undefined || locale === undefined) return null;

  return { postId, locale };
}

export interface PathMismatch {
  readonly field: "postId" | "locale";
  readonly inPath: string;
  readonly inFrontmatter: string;
}

/**
 * Takes plain strings rather than a validated `Frontmatter`.
 *
 * This check exists precisely to run on input that has not been trusted yet —
 * during import or while validating a deterministic exported file.
 * Requiring branded, already-validated values would make it unusable at the
 * only moment it matters.
 */
export function checkPathAgreement(
  filePath: string,
  frontmatter: { readonly postId: string; readonly locale: string }
): readonly PathMismatch[] {
  const parsed = parseContentPath(filePath);

  if (parsed === null) {
    return [
      {
        field: "postId",
        inPath: filePath,
        inFrontmatter: frontmatter.postId,
      },
    ];
  }

  const mismatches: PathMismatch[] = [];

  if (parsed.postId !== frontmatter.postId) {
    mismatches.push({
      field: "postId",
      inPath: parsed.postId,
      inFrontmatter: frontmatter.postId,
    });
  }

  if (parsed.locale !== frontmatter.locale) {
    mismatches.push({
      field: "locale",
      inPath: parsed.locale,
      inFrontmatter: frontmatter.locale,
    });
  }

  return mismatches;
}

/**
 * Key order for deterministic serialization.
 *
 * A no-op save must produce an empty diff (CONTENT_PIPELINE.md §4). That
 * requires the serializer to emit keys in a fixed order rather than whatever
 * order the object happens to have, because JavaScript object key order
 * depends on insertion and would differ between an edit and a round trip.
 */
export const FRONTMATTER_KEY_ORDER = [
  "schemaVersion",
  "postId",
  "locale",
  "title",
  "slug",
  "status",
  "publishedAt",
  "scheduledFor",
  "updatedAt",
  "excerpt",
  "category",
  "tags",
  "coverImage",
  "coverImageAlt",
  "seoTitle",
  "seoDescription",
  "canonicalUrl",
  "socialImage",
  "translationOf",
] as const satisfies readonly (keyof Frontmatter)[];
