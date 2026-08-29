import { z } from "zod";

import {
  mediaAssetIdSchema,
  postIdSchema,
  recordVersionSchema,
} from "../common/ids.js";
import { localeSchema } from "../common/locale.js";
import { frontmatterSchema } from "../content/frontmatter.js";

/**
 * Article lifecycle commands, per
 * [API_SPEC.md](../../../../docs/API_SPEC.md) §6.
 *
 * **Editorial state transitions are commands, not arbitrary status patches.**
 * That distinction is the entire design here. `PATCH { status: "published" }`
 * would be one code path that has to decide, from a diff, whether it is
 * publishing, scheduling, unpublishing, or archiving — and each of those has
 * different preconditions, different cache invalidation, different audit
 * events, and different authorization. Separate commands make each one
 * checkable in isolation.
 *
 * Every command addresses a single translation. A post is never published as a
 * whole, because its locales have independent state (ADR-005).
 */

export const MAX_BODY_BYTES = 512 * 1024;

/**
 * Article body Markdown.
 *
 * Bounded, LF-normalized, and BOM-stripped before anything else sees it. A BOM
 * survives a round trip through most editors and then appears as an invisible
 * character at the start of the first heading; normalizing here means the
 * serializer's "no-op save produces an empty diff" property actually holds for
 * a file that was opened in Notepad.
 */
export const bodyMarkdownSchema = z
  .string()
  .max(MAX_BODY_BYTES)
  .transform((value) => value.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n"));

/** Identifies the translation a command acts on. */
export const translationRefSchema = z.object({
  postId: postIdSchema,
  locale: localeSchema,
});

export type TranslationRef = z.infer<typeof translationRefSchema>;

/**
 * `PUT /admin/blog/posts/:id/translations/:locale` — explicit save.
 *
 * `baseVersion` is the optimistic-concurrency token and is null only for the
 * first save. Requiring the field prevents a client from silently omitting the
 * concurrency boundary.
 */
export const saveTranslationSchema = z
  .object({
    frontmatter: frontmatterSchema,
    body: bodyMarkdownSchema,
    baseVersion: recordVersionSchema.nullable(),
  })
  .strict();

export type SaveTranslation = z.infer<typeof saveTranslationSchema>;

/**
 * `PUT .../draft` — autosave.
 *
 * Writes to `PostDraft` and nothing else. **Never commits, never publishes,
 * and performs no publication version check** — an autosave that could conflict would
 * interrupt typing, and an autosave that could publish would turn a stray
 * keystroke into a live change.
 *
 * The frontmatter is `unknown` here rather than validated: a draft is
 * work in progress and is expected to be invalid most of the time. Validating
 * it would make autosave fail exactly when the author most needs their work
 * kept.
 */
export const autosaveDraftSchema = z
  .object({
    body: bodyMarkdownSchema,
    frontmatter: z.unknown().optional(),
    baseVersion: recordVersionSchema.nullable(),
  })
  .strict();

export type AutosaveDraft = z.infer<typeof autosaveDraftSchema>;

/**
 * `POST .../publish`.
 *
 * Carries no timestamp. The server sets `publishedAt` from its own clock,
 * because a client-supplied publication time is either redundant or a way to
 * backdate an article past the scheduler and the audit trail.
 *
 * `acknowledgedWarnings` exists because the publish checklist produces
 * warnings that are legitimately overridable — a missing SEO description is
 * worth flagging and not worth blocking. Requiring them to be listed
 * explicitly means the author saw each one rather than clicking past a
 * summary.
 */
export const publishTranslationSchema = z
  .object({
    version: recordVersionSchema,
    acknowledgedWarnings: z.array(z.string()).default([]),
  })
  .strict();

export type PublishTranslation = z.infer<typeof publishTranslationSchema>;

/**
 * `POST .../schedule`.
 *
 * The future check is enforced at the contract boundary rather than only in
 * the scheduler. A past `scheduledFor` would be picked up on the next tick and
 * published immediately, which is a publish command wearing a schedule
 * command's clothes — and it would skip the publish command's checklist.
 */
export const scheduleTranslationSchema = z
  .object({
    version: recordVersionSchema,
    scheduledFor: z
      .string()
      .refine((value) => !Number.isNaN(Date.parse(value)), {
        message: "Must be an ISO 8601 date-time string.",
      }),
    acknowledgedWarnings: z.array(z.string()).default([]),
  })
  .strict()
  .refine((value) => Date.parse(value.scheduledFor) > Date.now(), {
    message: "scheduledFor must be in the future.",
    path: ["scheduledFor"],
  });

export type ScheduleTranslation = z.infer<typeof scheduleTranslationSchema>;

/**
 * `POST .../unpublish`.
 *
 * Requires recent auth and a reason. The reason is not bureaucracy: an article
 * withdrawn for a legal issue and one withdrawn for a typo need different
 * follow-up, and the person who has to decide months later is reading the
 * audit log.
 */
export const unpublishTranslationSchema = z
  .object({
    version: recordVersionSchema,
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export type UnpublishTranslation = z.infer<typeof unpublishTranslationSchema>;

export const archiveTranslationSchema = z
  .object({
    version: recordVersionSchema,
    reason: z.string().trim().min(1).max(500),
    /**
     * Where the old URL should point. Archiving without a target leaves a
     * `410`, which is a valid answer but should be a deliberate one.
     */
    redirectTo: z.string().trim().max(512).nullable().default(null),
  })
  .strict();

export type ArchiveTranslation = z.infer<typeof archiveTranslationSchema>;

/**
 * `POST .../preview`.
 *
 * Renders through the production pipeline — not a separate preview renderer.
 * A preview that used different code would be a preview of something other
 * than what publishing produces, which is the one thing a preview must not be.
 */
export const previewTranslationSchema = z
  .object({
    body: bodyMarkdownSchema,
    frontmatter: frontmatterSchema,
  })
  .strict();

export type PreviewTranslation = z.infer<typeof previewTranslationSchema>;

export const previewResponseSchema = z.object({
  /** Short-lived, unguessable, `noindex`, `no-store`. */
  previewUrl: z.string().min(1),
  expiresAt: z.string().min(1),
});

export type PreviewResponse = z.infer<typeof previewResponseSchema>;

/**
 * `POST /admin/blog/import`.
 *
 * **Dry run by default.** Committing requires a second call carrying
 * `confirm: true` and the `reportToken` from the dry run. The token is what
 * makes the confirmation meaningful: without it, "confirm" would just be a
 * boolean a client could set on the first call, and the author would never
 * have seen the normalization report they are confirming.
 */
export const importRequestSchema = z
  .object({
    postId: postIdSchema.nullable(),
    locale: localeSchema,
    confirm: z.boolean().default(false),
    reportToken: z.string().min(1).nullable().default(null),
  })
  .strict()
  .refine((value) => !value.confirm || value.reportToken !== null, {
    message: "Confirming an import requires the reportToken from its dry run.",
    path: ["reportToken"],
  });

export type ImportRequest = z.infer<typeof importRequestSchema>;

export const importFindingSchema = z.object({
  severity: z.enum(["error", "warning", "info"]),
  /** 1-based line in the uploaded file, when the finding maps to one. */
  line: z.int().positive().nullable(),
  code: z.string().min(1),
  message: z.string().min(1),
});

export type ImportFinding = z.infer<typeof importFindingSchema>;

export const importReportSchema = z.object({
  reportToken: z.string().min(1),
  accepted: z.boolean(),
  findings: z.array(importFindingSchema),
  normalizedFrontmatter: frontmatterSchema.nullable(),
  /**
   * The complete deterministic `.md` envelope the confirmation would save.
   * This is deliberately returned even for `.mdx` input: accepted MDX has no
   * executable constructs left and PostgreSQL stores Markdown, never MDX.
   */
  normalizedDocument: z.string().nullable(),
  /** Exact diff the commit would produce, so nothing lands unseen. */
  diff: z.string(),
  /** Private evidence object retaining the exact uploaded bytes. */
  quarantinedSourceId: mediaAssetIdSchema,
  expiresAt: z.string().min(1),
});

export type ImportReport = z.infer<typeof importReportSchema>;

/**
 * Publish-checklist findings.
 *
 * Errors block; warnings are acknowledgeable. The split is a product decision
 * recorded in code so that it is applied consistently rather than re-argued
 * per field.
 */
export const PUBLISH_BLOCKERS = [
  "MISSING_TITLE",
  "MISSING_EXCERPT",
  "EMPTY_BODY",
  "BODY_HAS_H1",
  "UNKNOWN_CATEGORY",
  "UNKNOWN_TAG",
  "MISSING_MEDIA",
  "COVER_WITHOUT_ALT",
  "SLUG_COLLISION",
  "UNSAFE_LINK",
  "INVALID_SOURCE_INTEGRITY",
] as const;

export const PUBLISH_WARNINGS = [
  "MISSING_SEO_DESCRIPTION",
  "MISSING_COVER_IMAGE",
  "OFFSITE_CANONICAL",
  "SHORT_BODY",
  "NO_INTERNAL_LINKS",
  "UNTRANSLATED_COUNTERPART",
] as const;

export const publishBlockerSchema = z.enum(PUBLISH_BLOCKERS);
export const publishWarningSchema = z.enum(PUBLISH_WARNINGS);

export type PublishBlocker = z.infer<typeof publishBlockerSchema>;
export type PublishWarning = z.infer<typeof publishWarningSchema>;

export const publishChecklistSchema = z.object({
  blockers: z.array(publishBlockerSchema),
  warnings: z.array(publishWarningSchema),
});

/**
 * Declared as an interface with `readonly` arrays rather than taken from
 * `z.infer`.
 *
 * A checklist is a finding, not a workspace: nothing downstream should be able
 * to push a blocker onto it and change whether an article may publish. The
 * inferred type has mutable arrays, and a parsed result is still assignable to
 * this, so validation is unaffected.
 */
export interface PublishChecklist {
  readonly blockers: readonly PublishBlocker[];
  readonly warnings: readonly PublishWarning[];
}

export function canPublish(checklist: PublishChecklist): boolean {
  return checklist.blockers.length === 0;
}

/**
 * Whether every warning the checklist raised was acknowledged.
 *
 * Compares as a set: acknowledging a warning that is no longer raised is
 * harmless, but publishing with an unacknowledged one is not.
 */
export function warningsSatisfied(
  checklist: PublishChecklist,
  acknowledged: readonly string[]
): boolean {
  const seen = new Set(acknowledged);
  return checklist.warnings.every((warning) => seen.has(warning));
}
