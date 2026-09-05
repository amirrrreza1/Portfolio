ALTER TABLE "contact_messages"
  ADD COLUMN "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextAttemptAt" TIMESTAMPTZ(6),
  ADD COLUMN "lastError" TEXT;

ALTER TABLE "contact_messages"
  ADD CONSTRAINT "contact_messages_delivery_attempts_nonnegative"
  CHECK ("deliveryAttempts" >= 0),
  ADD CONSTRAINT "contact_messages_last_error_bounded"
  CHECK ("lastError" IS NULL OR length("lastError") <= 160);

CREATE INDEX "contact_messages_deliveryStatus_nextAttemptAt_idx"
  ON "contact_messages"("deliveryStatus", "nextAttemptAt");
