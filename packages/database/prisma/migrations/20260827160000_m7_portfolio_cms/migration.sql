-- M7 gives every independently edited portfolio record its own concurrency
-- token and supplies recoverable soft-delete state to the remaining resource
-- families. Existing rows begin at version zero, matching the original API
-- contract and allowing a first If-Match: 0 write.

ALTER TABLE "site_settings_translations" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "page_section_translations" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "project_translations" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "skill_category_translations" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "certificate_translations" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "nav_items" ADD COLUMN "archivedAt" TIMESTAMPTZ(6);
ALTER TABLE "social_links" ADD COLUMN "archivedAt" TIMESTAMPTZ(6);
ALTER TABLE "skill_categories" ADD COLUMN "archivedAt" TIMESTAMPTZ(6);
ALTER TABLE "skills" ADD COLUMN "archivedAt" TIMESTAMPTZ(6);
ALTER TABLE "quotes" ADD COLUMN "archivedAt" TIMESTAMPTZ(6);

ALTER TABLE "media_assets" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "resume_versions" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "nav_items_archivedAt_idx" ON "nav_items"("archivedAt");
CREATE INDEX "social_links_archivedAt_idx" ON "social_links"("archivedAt");
CREATE INDEX "skill_categories_archivedAt_idx" ON "skill_categories"("archivedAt");
CREATE INDEX "skills_archivedAt_idx" ON "skills"("archivedAt");
CREATE INDEX "quotes_archivedAt_idx" ON "quotes"("archivedAt");
