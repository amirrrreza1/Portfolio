-- Recovery for the partially-applied 20260825120000_postgres_native_articles.
-- Statements 1-54 of that migration are already in the database; this file
-- clears the two rows that block its final constraint, then applies the
-- remaining statements (lines 55-90) verbatim, in one transaction.

BEGIN;

-- ADR-015: a render cache whose source authority has been removed is discarded,
-- not trusted. The migration's UPDATE demoted these rows to DRAFT but left the
-- derived render behind, which its own constraint then rejects.
UPDATE "post_translations"
SET "renderedHtml" = NULL,
    "rendererVersion" = NULL,
    "readingMinutes" = NULL,
    "headingTree" = NULL,
    "frontmatterSchemaVersion" = NULL
WHERE "bodyMarkdown" IS NULL
  AND "renderedHtml" IS NOT NULL;

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

COMMIT;
