import { z } from "zod";

/**
 * Opaque resource identifiers.
 *
 * [API_SPEC.md](../../../../docs/API_SPEC.md) §1 requires IDs to be opaque
 * strings, and [DATA_MODEL.md](../../../../docs/DATA_MODEL.md) §2 forbids
 * guessable sequence numbers in public URLs. Both are satisfied by accepting
 * UUID or CUID2 shapes and nothing else.
 *
 * The brands exist so that a `ProjectId` cannot be passed where a `PostId` is
 * expected. TypeScript would happily accept either as `string`, and the two are
 * indistinguishable at a glance in a call like `attachMedia(a, b)`.
 */

/** RFC 9562 UUID, any version, lowercase or uppercase. */
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** CUID2: a lowercase letter followed by 23 lowercase alphanumerics. */
const CUID2 = /^[a-z][0-9a-z]{23}$/;

export const resourceIdSchema = z
  .string()
  .trim()
  .refine((value) => UUID.test(value) || CUID2.test(value), {
    message: "Must be a UUID or a CUID2 identifier.",
  });

/**
 * Builds a branded identifier schema for one entity type.
 *
 * The brand is a compile-time marker only; the runtime value stays a plain
 * string, so these IDs serialize and compare exactly as before.
 */
function brandedId<Brand extends string>(brand: Brand) {
  return resourceIdSchema.brand<Brand>();
}

export const userIdSchema = brandedId("UserId");
export const sessionIdSchema = brandedId("SessionId");
export const mediaAssetIdSchema = brandedId("MediaAssetId");
export const projectIdSchema = brandedId("ProjectId");
export const skillIdSchema = brandedId("SkillId");
export const skillCategoryIdSchema = brandedId("SkillCategoryId");
export const certificateIdSchema = brandedId("CertificateId");
export const quoteIdSchema = brandedId("QuoteId");
export const pageSectionIdSchema = brandedId("PageSectionId");
export const navItemIdSchema = brandedId("NavItemId");
export const socialLinkIdSchema = brandedId("SocialLinkId");
export const postIdSchema = brandedId("PostId");
export const postTranslationIdSchema = brandedId("PostTranslationId");
export const categoryIdSchema = brandedId("CategoryId");
export const tagIdSchema = brandedId("TagId");
export const resumeVersionIdSchema = brandedId("ResumeVersionId");

export type ResourceId = z.infer<typeof resourceIdSchema>;
export type UserId = z.infer<typeof userIdSchema>;
export type SessionId = z.infer<typeof sessionIdSchema>;
export type MediaAssetId = z.infer<typeof mediaAssetIdSchema>;
export type ProjectId = z.infer<typeof projectIdSchema>;
export type SkillId = z.infer<typeof skillIdSchema>;
export type SkillCategoryId = z.infer<typeof skillCategoryIdSchema>;
export type CertificateId = z.infer<typeof certificateIdSchema>;
export type QuoteId = z.infer<typeof quoteIdSchema>;
export type PageSectionId = z.infer<typeof pageSectionIdSchema>;
export type NavItemId = z.infer<typeof navItemIdSchema>;
export type SocialLinkId = z.infer<typeof socialLinkIdSchema>;
export type PostId = z.infer<typeof postIdSchema>;
export type PostTranslationId = z.infer<typeof postTranslationIdSchema>;
export type CategoryId = z.infer<typeof categoryIdSchema>;
export type TagId = z.infer<typeof tagIdSchema>;
export type ResumeVersionId = z.infer<typeof resumeVersionIdSchema>;

/**
 * Stable keys chosen by developers, not users: section keys, icon keys, theme
 * keys, taxonomy keys. Constrained to lowercase kebab-case so a key can never
 * need escaping in an attribute, a CSS selector, or a file path.
 */
export const stableKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(
    /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/,
    "Must be lowercase kebab-case, starting with a letter."
  );

export type StableKey = z.infer<typeof stableKeySchema>;

/**
 * Optimistic-concurrency token for mutable admin records
 * ([DATA_MODEL.md](../../../../docs/DATA_MODEL.md) §2). Sent as `If-Match`;
 * a stale value is a `409 CONFLICT` that writes nothing
 * ([API_SPEC.md](../../../../docs/API_SPEC.md) §3).
 */
export const recordVersionSchema = z.int().nonnegative();

export type RecordVersion = z.infer<typeof recordVersionSchema>;

/**
 * Legacy numeric identifier from the pre-migration JSON, preserved in
 * `legacyId` columns so the M2 reconciliation can be re-run after the fact.
 * Never exposed in a public DTO.
 */
export const legacyIdSchema = z.int().positive();

export type LegacyId = z.infer<typeof legacyIdSchema>;
