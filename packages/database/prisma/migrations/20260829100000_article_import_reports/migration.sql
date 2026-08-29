-- Durable review state for M8's parse/report/confirm Markdown import.
-- The bearer token itself never lands in PostgreSQL; only its SHA-256 digest
-- is stored. Original bytes are retained through a private quarantined media
-- row and can therefore never be referenced by public article content.
CREATE TABLE "article_import_reports" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "originalMediaId" TEXT NOT NULL,
    "requestedPostId" TEXT,
    "postId" TEXT,
    "locale" "Locale" NOT NULL,
    "baseVersion" INTEGER,
    "accepted" BOOLEAN NOT NULL,
    "findings" JSONB NOT NULL,
    "normalizedFrontmatter" JSONB,
    "normalizedBody" TEXT,
    "diff" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "committedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_import_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "article_import_reports_tokenHash_key"
  ON "article_import_reports"("tokenHash");

CREATE UNIQUE INDEX "article_import_reports_originalMediaId_key"
  ON "article_import_reports"("originalMediaId");

CREATE INDEX "article_import_reports_actorId_expiresAt_idx"
  ON "article_import_reports"("actorId", "expiresAt");

CREATE INDEX "article_import_reports_expiresAt_committedAt_idx"
  ON "article_import_reports"("expiresAt", "committedAt");

ALTER TABLE "article_import_reports"
  ADD CONSTRAINT "article_import_reports_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "article_import_reports"
  ADD CONSTRAINT "article_import_reports_originalMediaId_fkey"
  FOREIGN KEY ("originalMediaId") REFERENCES "media_assets"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- A report with normalized content is commit-capable; a rejected report has
-- neither half. This guards against a future code path persisting partial
-- review state and later treating it as confirmable.
ALTER TABLE "article_import_reports"
  ADD CONSTRAINT "article_import_reports_normalized_pair"
  CHECK (
    ("accepted" = TRUE AND "postId" IS NOT NULL AND
      "normalizedFrontmatter" IS NOT NULL AND "normalizedBody" IS NOT NULL)
    OR
    ("accepted" = FALSE AND "normalizedFrontmatter" IS NULL AND
      "normalizedBody" IS NULL)
  );
