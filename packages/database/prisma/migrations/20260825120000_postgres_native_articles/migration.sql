-- ADR-015: PostgreSQL becomes the sole authority for Markdown article source.
-- Historical migrations remain unchanged; this is a forward-only transition.

ALTER TABLE "post_translations"
  ADD COLUMN "bodyMarkdown" TEXT,
  ADD COLUMN "bodySha256" TEXT;

-- Existing Git-index rows do not contain recoverable Markdown. Do not invent
-- source or continue publishing a render whose authority has been removed.
UPDATE "post_translations"
SET "status" = 'DRAFT',
    "publishedAt" = NULL,
    "scheduledFor" = NULL
WHERE "bodyMarkdown" IS NULL;

DROP INDEX IF EXISTS "post_translations_public_listing";
DROP INDEX IF EXISTS "post_translations_public_slug";
DROP INDEX IF EXISTS "post_translations_degraded";
DROP INDEX IF EXISTS "post_translations_syncState_idx";
DROP INDEX IF EXISTS "post_translations_sourceBlobSha_idx";

ALTER TABLE "post_translations"
  DROP CONSTRAINT IF EXISTS "post_translations_render_cache_provenance",
  DROP CONSTRAINT IF EXISTS "post_translations_published_has_source",
  DROP COLUMN "sourceBlobSha",
  DROP COLUMN "syncState",
  DROP COLUMN "syncError",
  DROP COLUMN "lastSyncedAt";

ALTER TABLE "post_drafts"
  DROP COLUMN "baseBlobSha",
  ADD COLUMN "baseVersion" INTEGER;

DROP TABLE IF EXISTS "content_sync_logs";
DROP TABLE IF EXISTS "content_write_operations";
DROP TABLE IF EXISTS "content_apply_ledger";
DROP TABLE IF EXISTS "webhook_deliveries";

ALTER TABLE "content_invalidation_outbox"
  DROP COLUMN IF EXISTS "operationId";

DELETE FROM "content_jobs" WHERE "kind" <> 'PUBLISH_DUE';
ALTER TYPE "ContentJobKind" RENAME TO "ContentJobKind_old";
CREATE TYPE "ContentJobKind" AS ENUM ('PUBLISH_DUE');
ALTER TABLE "content_jobs"
  ALTER COLUMN "kind" TYPE "ContentJobKind"
  USING ("kind"::text::"ContentJobKind");
DROP TYPE "ContentJobKind_old";

DROP TYPE IF EXISTS "SyncState";
DROP TYPE IF EXISTS "SyncTrigger";
DROP TYPE IF EXISTS "SyncOutcome";
DROP TYPE IF EXISTS "ContentWriteOperationState";

ALTER TABLE "post_translations"
  ADD CONSTRAINT "post_translations_render_cache_provenance"
  CHECK (
    "renderedHtml" IS NULL
    OR (
      "rendererVersion" IS NOT NULL
      AND "bodyMarkdown" IS NOT NULL
      AND "bodySha256" ~ '^[0-9a-f]{64}$'
    )
  ),
  ADD CONSTRAINT "post_translations_published_has_source"
  CHECK (
    "status" <> 'PUBLISHED'
    OR (
      "bodyMarkdown" IS NOT NULL
      AND octet_length("bodyMarkdown") > 0
      AND "bodySha256" ~ '^[0-9a-f]{64}$'
    )
  );

CREATE INDEX "post_translations_bodySha256_idx"
  ON "post_translations" ("bodySha256");

CREATE INDEX "post_translations_public_listing"
  ON "post_translations" ("locale", "publishedAt" DESC)
  WHERE "status" = 'PUBLISHED'
    AND "bodyMarkdown" IS NOT NULL
    AND "bodySha256" IS NOT NULL
    AND "archivedAt" IS NULL;

CREATE INDEX "post_translations_public_slug"
  ON "post_translations" ("locale", "slug")
  WHERE "status" = 'PUBLISHED'
    AND "bodyMarkdown" IS NOT NULL
    AND "bodySha256" IS NOT NULL
    AND "archivedAt" IS NULL;
