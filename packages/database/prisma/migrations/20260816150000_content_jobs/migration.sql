-- The durable job queue from ADR-013.
--
-- Hand-written rather than generated, because this repository's migrations are
-- created against a live database and this one was authored without one. Verify
-- before trusting it:
--
--   pnpm --filter @portfolio/database exec prisma migrate diff \
--     --from-migrations prisma/migrations \
--     --to-schema-datamodel prisma/schema.prisma \
--     --shadow-database-url "$SHADOW_DATABASE_URL" --script
--
-- That must print no statements. If it prints any, this file is wrong and the
-- generated output is right.
--
-- It carries its own CHECK constraints and partial indexes, unlike the initial
-- schema which split them into a second migration: the split existed so the
-- hand-written constraints could be staged into a generated migration, and
-- there is nothing to stage when the whole file is hand-written. The canonical
-- copy of these constraints still lives in prisma/sql/integrity_constraints.sql,
-- which is what a fresh database and the constraint tests apply.

-- CreateEnum
CREATE TYPE "ContentJobKind" AS ENUM ('WEBHOOK_RECONCILE', 'SCHEDULED_RECONCILE', 'PUBLISH_DUE');

-- CreateEnum
CREATE TYPE "ContentJobState" AS ENUM ('PENDING', 'CLAIMED', 'SUCCEEDED', 'DEAD');

-- CreateTable
CREATE TABLE "content_jobs" (
    "id" TEXT NOT NULL,
    "kind" "ContentJobKind" NOT NULL,
    "lockKey" TEXT NOT NULL,
    "dedupeKey" TEXT,
    "payload" JSONB NOT NULL,
    "state" "ContentJobState" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "availableAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseExpiresAt" TIMESTAMPTZ(6),
    "claimedBy" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "finishedAt" TIMESTAMPTZ(6),

    CONSTRAINT "content_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "content_jobs_state_availableAt_idx" ON "content_jobs"("state", "availableAt");

-- CreateIndex
CREATE INDEX "content_jobs_state_leaseExpiresAt_idx" ON "content_jobs"("state", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "content_jobs_lockKey_idx" ON "content_jobs"("lockKey");

-- Everything below is hand-written: Prisma's schema language cannot express
-- partial unique indexes or CHECK constraints. See
-- prisma/sql/integrity_constraints.sql for the annotated copy.

CREATE UNIQUE INDEX "content_jobs_one_claim_per_lock_key"
  ON "content_jobs" ("lockKey")
  WHERE "state" = 'CLAIMED';

CREATE UNIQUE INDEX "content_jobs_pending_dedupe"
  ON "content_jobs" ("dedupeKey")
  WHERE "dedupeKey" IS NOT NULL AND "state" = 'PENDING';

CREATE INDEX "content_jobs_claimable"
  ON "content_jobs" ("availableAt")
  WHERE "state" = 'PENDING';

CREATE INDEX "content_jobs_expired_leases"
  ON "content_jobs" ("leaseExpiresAt")
  WHERE "state" = 'CLAIMED';

ALTER TABLE "content_jobs"
  ADD CONSTRAINT "content_jobs_attempt_bounds"
  CHECK ("attempts" >= 0 AND "maxAttempts" >= 1 AND "attempts" <= "maxAttempts");

ALTER TABLE "content_jobs"
  ADD CONSTRAINT "content_jobs_claim_has_lease"
  CHECK (
    ("state" = 'CLAIMED') = ("leaseExpiresAt" IS NOT NULL AND "claimedBy" IS NOT NULL)
  );

ALTER TABLE "content_jobs"
  ADD CONSTRAINT "content_jobs_terminal_has_finished_at"
  CHECK (
    ("state" IN ('SUCCEEDED', 'DEAD')) = ("finishedAt" IS NOT NULL)
  );

ALTER TABLE "content_jobs"
  ADD CONSTRAINT "content_jobs_dead_only_when_exhausted"
  CHECK ("state" <> 'DEAD' OR "attempts" >= "maxAttempts");
