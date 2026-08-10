import { z } from "zod";

import { postTranslationIdSchema } from "../common/ids.js";
import { localeSchema } from "../common/locale.js";
import { isoTimestampSchema } from "../common/values.js";

/**
 * Content-store sync state, per
 * [DATA_MODEL.md](../../../../docs/DATA_MODEL.md) §5 and
 * [CONTENT_PIPELINE.md](../../../../docs/CONTENT_PIPELINE.md) §7.
 *
 * The governing rule: **anything other than `SYNCED` excludes a translation
 * from newly generated feeds and sitemaps.** A degraded translation stays
 * visible at its existing URL — pulling a live article because a sync job
 * hiccuped would be a worse failure than serving a slightly stale one — but it
 * does not get announced again until the drift is resolved.
 */

export const syncStateSchema = z.enum([
  "SYNCED",
  "PENDING",
  "SYNC_FAILED",
  "MISSING_IN_GIT",
  "FRONTMATTER_DRIFT",
]);

export type SyncState = z.infer<typeof syncStateSchema>;

/**
 * The one predicate that decides discovery inclusion.
 *
 * Exported as a function rather than left as an inline comparison so that
 * every listing, feed, and sitemap asks the same question. An inline
 * `=== "SYNCED"` in five places is five places to forget one.
 */
export function isDiscoverable(state: SyncState): boolean {
  return state === "SYNCED";
}

/** Human-facing explanation for the admin dashboard. */
export const SYNC_STATE_MEANING: { readonly [K in SyncState]: string } = {
  SYNCED: "The index matches the file in Git.",
  PENDING: "A change is queued and has not been applied yet.",
  SYNC_FAILED: "The last sync attempt failed. The live output is unchanged.",
  MISSING_IN_GIT:
    "The index has a row but Git has no file. The article was not unpublished — investigate before acting.",
  FRONTMATTER_DRIFT:
    "The site is correct and the file is stale: publication succeeded but the reconciliation commit could not land.",
} as const;

export const syncTriggerSchema = z.enum([
  "ADMIN_SAVE",
  "WEBHOOK",
  "RECONCILE",
  "SCHEDULER_BOT",
  "IMPORT",
]);

export type SyncTrigger = z.infer<typeof syncTriggerSchema>;

export const syncOutcomeSchema = z.enum(["SUCCESS", "PARTIAL", "FAILURE"]);

export type SyncOutcome = z.infer<typeof syncOutcomeSchema>;

/** One degraded translation, as shown on the dashboard. */
export const driftEntrySchema = z.object({
  translationId: postTranslationIdSchema,
  locale: localeSchema,
  title: z.string().min(1),
  syncState: syncStateSchema,
  syncError: z.string().nullable(),
  lastSyncedAt: isoTimestampSchema.nullable(),
});

export type DriftEntry = z.infer<typeof driftEntrySchema>;

/**
 * `GET /admin/content-store/status`.
 *
 * `lastSuccessfulReconciliation` being null or old is the signal that matters
 * most, and it is easy to miss: every individual sync can succeed while the
 * scheduled full reconciliation has silently not run for weeks, and drift
 * accumulates unnoticed precisely because nothing failed.
 */
export const contentStoreStatusSchema = z.object({
  counts: z.object({
    SYNCED: z.int().nonnegative(),
    PENDING: z.int().nonnegative(),
    SYNC_FAILED: z.int().nonnegative(),
    MISSING_IN_GIT: z.int().nonnegative(),
    FRONTMATTER_DRIFT: z.int().nonnegative(),
  }),
  drift: z.array(driftEntrySchema),
  pendingBotCommits: z.int().nonnegative(),
  lastSuccessfulReconciliation: isoTimestampSchema.nullable(),
  /**
   * Whether the Git host is currently reachable. Git being down blocks
   * authoring only — public reads and database-driven publication state are
   * unaffected — so this is informational, not an outage banner.
   */
  contentStoreReachable: z.boolean(),
});

export type ContentStoreStatus = z.infer<typeof contentStoreStatusSchema>;

/**
 * A Git blob SHA, used as the optimistic-concurrency token for article bodies.
 *
 * Accepts both SHA-1 (40 hex) and SHA-256 (64 hex): GitHub is migrating, and a
 * schema that accepted only one length would break on whichever side of that
 * transition it was not written for.
 */
export const blobShaSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{40}$|^[0-9a-f]{64}$/, "Must be a Git blob SHA.");

export type BlobSha = z.infer<typeof blobShaSchema>;

/**
 * A conflict on an article body.
 *
 * Carries the diff rather than just reporting the collision, because the
 * author's only useful next action is to see what changed. `409` with no diff
 * forces them to reload and compare by hand, which is where work gets lost.
 */
export const contentConflictSchema = z.object({
  expectedSha: blobShaSchema,
  currentSha: blobShaSchema,
  /** Unified diff between the author's base and the current file. */
  diff: z.string(),
  currentUpdatedAt: isoTimestampSchema.nullable(),
});

export type ContentConflict = z.infer<typeof contentConflictSchema>;
