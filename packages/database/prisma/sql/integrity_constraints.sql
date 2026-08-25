-- Integrity constraints that Prisma's schema language cannot express.
--
-- Prisma has no syntax for CHECK constraints, partial unique indexes, or
-- expression indexes. Everything below is therefore hand-written SQL applied as
-- its own migration, and it is not optional decoration: several of these are the
-- only thing standing between a bug in application code and a row that the rest
-- of the system assumes cannot exist.
--
-- The rule this file follows: if a specification says a state is impossible, the
-- database enforces it. Application validation catches the honest mistake and
-- gives a good error message; the constraint catches the dishonest one, the
-- race, and the direct psql session.
--
-- Applied by: see prisma/migrations/README.md.

-- ---------------------------------------------------------------------------
-- Singletons
-- ---------------------------------------------------------------------------

-- A settings table that can hold two rows eventually holds two rows, and then
-- every read has to decide which one is real.
ALTER TABLE "site_settings"
  ADD CONSTRAINT "site_settings_singleton" CHECK ("id" = 1);

ALTER TABLE "appearance_settings"
  ADD CONSTRAINT "appearance_settings_singleton" CHECK ("id" = 1);

ALTER TABLE "site_settings"
  ADD CONSTRAINT "site_settings_retention_positive"
  CHECK ("contactRetentionDays" > 0);

-- The default locale must itself be enabled, or the site has no renderable
-- fallback. Note that array_length returns NULL for an empty array rather than
-- 0, and a CHECK evaluating to NULL passes — hence coalesce below.
ALTER TABLE "site_settings"
  ADD CONSTRAINT "site_settings_default_locale_enabled"
  CHECK ("defaultLocale" = ANY ("enabledLocales"));

ALTER TABLE "site_settings"
  ADD CONSTRAINT "site_settings_locales_not_empty"
  CHECK (coalesce(array_length("enabledLocales", 1), 0) >= 1);

ALTER TABLE "appearance_settings"
  ADD CONSTRAINT "appearance_settings_themes_not_empty"
  CHECK (coalesce(array_length("enabledThemes", 1), 0) >= 1);

ALTER TABLE "appearance_settings"
  ADD CONSTRAINT "appearance_settings_fonts_not_empty"
  CHECK (coalesce(array_length("enabledBlogFonts", 1), 0) >= 1);

ALTER TABLE "appearance_settings"
  ADD CONSTRAINT "appearance_settings_sizes_not_empty"
  CHECK (coalesce(array_length("allowedBlogSizeSteps", 1), 0) >= 1);

-- ---------------------------------------------------------------------------
-- Publication state invariants
-- ---------------------------------------------------------------------------

-- The one that matters most. DATA_MODEL.md §5 states these invariants as
-- absolute, and a PUBLISHED translation with no publishedAt would silently
-- break feed ordering, sitemap generation, and the scheduler's idea of what is
-- still pending.
--
--   PUBLISHED  requires publishedAt
--   SCHEDULED  requires scheduledFor and forbids publishedAt
--   DRAFT      has neither
--
-- ARCHIVED deliberately keeps publishedAt: the article was published, and the
-- redirect and canonical history depend on knowing when.
ALTER TABLE "post_translations"
  ADD CONSTRAINT "post_translations_publish_state"
  CHECK (
    ("status" = 'PUBLISHED' AND "publishedAt" IS NOT NULL)
    OR ("status" = 'SCHEDULED' AND "scheduledFor" IS NOT NULL AND "publishedAt" IS NULL)
    OR ("status" = 'DRAFT' AND "publishedAt" IS NULL AND "scheduledFor" IS NULL)
    OR ("status" = 'ARCHIVED')
  );

-- A render cache is only a cache if its provenance is recorded. Without both
-- values there is no way to tell whether the HTML is stale, and stale HTML that
-- cannot be identified as stale is indistinguishable from authoritative
-- content.
ALTER TABLE "post_translations"
  ADD CONSTRAINT "post_translations_render_cache_provenance"
  CHECK (
    "renderedHtml" IS NULL
    OR (
      "rendererVersion" IS NOT NULL
      AND "bodyMarkdown" IS NOT NULL
      AND "bodySha256" ~ '^[0-9a-f]{64}$'
    )
  );

-- Published content must retain its authoritative Markdown and a complete
-- SHA-256 digest. Legacy indexed rows fail closed until explicitly reimported.
ALTER TABLE "post_translations"
  ADD CONSTRAINT "post_translations_published_has_source"
  CHECK (
    "status" <> 'PUBLISHED'
    OR (
      "bodyMarkdown" IS NOT NULL
      AND octet_length("bodyMarkdown") > 0
      AND "bodySha256" ~ '^[0-9a-f]{64}$'
    )
  );

ALTER TABLE "post_translations"
  ADD CONSTRAINT "post_translations_title_not_blank"
  CHECK (btrim("title") <> '');

ALTER TABLE "post_translations"
  ADD CONSTRAINT "post_translations_slug_not_blank"
  CHECK (btrim("slug") <> '' AND "slug" NOT LIKE '%/%');

ALTER TABLE "post_translations"
  ADD CONSTRAINT "post_translations_reading_minutes_positive"
  CHECK ("readingMinutes" IS NULL OR "readingMinutes" > 0);

-- ---------------------------------------------------------------------------
-- Resume: at most one active version
-- ---------------------------------------------------------------------------

-- Partial unique index rather than a boolean column. A boolean "isActive" makes
-- "exactly one" an application invariant that two concurrent activations can
-- violate; this makes the second one fail.
CREATE UNIQUE INDEX "resume_versions_single_active"
  ON "resume_versions" ((1))
  WHERE "activatedAt" IS NOT NULL AND "retiredAt" IS NULL;

ALTER TABLE "resume_versions"
  ADD CONSTRAINT "resume_versions_retired_after_activated"
  CHECK (
    "retiredAt" IS NULL
    OR ("activatedAt" IS NOT NULL AND "retiredAt" >= "activatedAt")
  );

-- ---------------------------------------------------------------------------
-- Media
-- ---------------------------------------------------------------------------

ALTER TABLE "media_assets"
  ADD CONSTRAINT "media_assets_size_positive" CHECK ("byteSize" > 0);

-- SHA-256, lowercase hex, exactly 64 characters. Fixing the case at the
-- database level means checksum comparison never has to normalize first.
ALTER TABLE "media_assets"
  ADD CONSTRAINT "media_assets_checksum_format"
  CHECK ("checksumSha256" ~ '^[0-9a-f]{64}$');

-- Both dimensions or neither. The IS NOT NULL guards are load-bearing: with
-- width = 100 and height = NULL the comparison branch evaluates to NULL, and a
-- CHECK constraint that evaluates to NULL *passes*. Written without them, this
-- constraint silently permits exactly the half-populated row it exists to stop.
ALTER TABLE "media_assets"
  ADD CONSTRAINT "media_assets_dimensions"
  CHECK (
    ("width" IS NULL AND "height" IS NULL)
    OR ("width" IS NOT NULL AND "height" IS NOT NULL AND "width" > 0 AND "height" > 0)
  );

-- A quarantined object is never public. This is the constraint that prevents a
-- failed verification from being served because some later code path forgot to
-- re-check processingState.
ALTER TABLE "media_assets"
  ADD CONSTRAINT "media_assets_quarantine_is_private"
  CHECK ("processingState" <> 'QUARANTINED' OR "visibility" = 'PRIVATE');

-- ---------------------------------------------------------------------------
-- Colour and format checks
-- ---------------------------------------------------------------------------

-- Six-digit lowercase hex. Three-digit shorthand and named colours are rejected
-- so the contrast checker has exactly one form to parse.
ALTER TABLE "skills"
  ADD CONSTRAINT "skills_color_format" CHECK ("color" ~ '^#[0-9a-f]{6}$');

ALTER TABLE "skills"
  ADD CONSTRAINT "skills_name_not_blank" CHECK (btrim("name") <> '');

-- ---------------------------------------------------------------------------
-- Sort order
-- ---------------------------------------------------------------------------

ALTER TABLE "page_sections" ADD CONSTRAINT "page_sections_sort_order_range" CHECK ("sortOrder" BETWEEN 0 AND 10000);
ALTER TABLE "nav_items" ADD CONSTRAINT "nav_items_sort_order_range" CHECK ("sortOrder" BETWEEN 0 AND 10000);
ALTER TABLE "social_links" ADD CONSTRAINT "social_links_sort_order_range" CHECK ("sortOrder" BETWEEN 0 AND 10000);
ALTER TABLE "projects" ADD CONSTRAINT "projects_sort_order_range" CHECK ("sortOrder" BETWEEN 0 AND 10000);
ALTER TABLE "skill_categories" ADD CONSTRAINT "skill_categories_sort_order_range" CHECK ("sortOrder" BETWEEN 0 AND 10000);
ALTER TABLE "skills" ADD CONSTRAINT "skills_sort_order_range" CHECK ("sortOrder" BETWEEN 0 AND 10000);
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_sort_order_range" CHECK ("sortOrder" BETWEEN 0 AND 10000);
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_sort_order_range" CHECK ("sortOrder" BETWEEN 0 AND 10000);
ALTER TABLE "categories" ADD CONSTRAINT "categories_sort_order_range" CHECK ("sortOrder" BETWEEN 0 AND 10000);
ALTER TABLE "tags" ADD CONSTRAINT "tags_sort_order_range" CHECK ("sortOrder" BETWEEN 0 AND 10000);
ALTER TABLE "project_skills" ADD CONSTRAINT "project_skills_sort_order_range" CHECK ("sortOrder" BETWEEN 0 AND 10000);

-- ---------------------------------------------------------------------------
-- URLs and links
-- ---------------------------------------------------------------------------

-- mailto: only for kind = EMAIL; everything else must be absolute https. The
-- contract enforces this too, but this is the layer that also covers a direct
-- INSERT and the M2 migration.
ALTER TABLE "social_links"
  ADD CONSTRAINT "social_links_url_scheme"
  CHECK (
    ("kind" = 'EMAIL' AND "url" LIKE 'mailto:%')
    OR ("kind" <> 'EMAIL' AND "url" LIKE 'https://%')
  );

-- A placeholder "#" is not a URL. The legacy Portfolio project row carries one,
-- and M2 must convert it to NULL rather than storing it as a link that renders
-- and goes nowhere.
ALTER TABLE "projects"
  ADD CONSTRAINT "projects_demo_url_absolute"
  CHECK ("demoUrl" IS NULL OR "demoUrl" LIKE 'https://%');

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_repository_url_absolute"
  CHECK ("repositoryUrl" IS NULL OR "repositoryUrl" LIKE 'https://%');

ALTER TABLE "certificates"
  ADD CONSTRAINT "certificates_urls_absolute"
  CHECK (
    ("issuerUrl" IS NULL OR "issuerUrl" LIKE 'https://%')
    AND ("instructorUrl" IS NULL OR "instructorUrl" LIKE 'https://%')
    AND ("credentialUrl" IS NULL OR "credentialUrl" LIKE 'https://%')
  );

ALTER TABLE "quotes"
  ADD CONSTRAINT "quotes_source_url_absolute"
  CHECK ("sourceUrl" IS NULL OR "sourceUrl" LIKE 'https://%');

ALTER TABLE "site_settings"
  ADD CONSTRAINT "site_settings_canonical_url_absolute"
  CHECK ("canonicalSiteUrl" LIKE 'https://%' OR "canonicalSiteUrl" LIKE 'http://localhost%');

-- INTERNAL_ROUTE targets are site-relative and must not be protocol-relative.
-- A browser treats //host as absolute, so allowing it would turn the header
-- into an off-site redirect surface.
ALTER TABLE "nav_items"
  ADD CONSTRAINT "nav_items_target_shape"
  CHECK (
    ("targetKind" = 'INTERNAL_ROUTE' AND "target" LIKE '/%' AND "target" NOT LIKE '//%' AND "target" NOT LIKE '%..%')
    OR ("targetKind" = 'SECTION_ANCHOR' AND "target" ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$')
  );

-- ---------------------------------------------------------------------------
-- Redirects
-- ---------------------------------------------------------------------------

ALTER TABLE "slug_redirects"
  ADD CONSTRAINT "slug_redirects_status_code"
  CHECK ("statusCode" IN (301, 308));

-- A redirect to itself is an infinite loop, not a redirect.
ALTER TABLE "slug_redirects"
  ADD CONSTRAINT "slug_redirects_no_self_target"
  CHECK ("fromPath" <> "toPath");

ALTER TABLE "slug_redirects"
  ADD CONSTRAINT "slug_redirects_paths_relative"
  CHECK ("fromPath" LIKE '/%' AND "toPath" LIKE '/%');

-- ---------------------------------------------------------------------------
-- Text integrity
-- ---------------------------------------------------------------------------

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_slug_not_blank"
  CHECK (btrim("slug") <> '' AND "slug" NOT LIKE '%/%');

ALTER TABLE "project_translations"
  ADD CONSTRAINT "project_translations_title_not_blank"
  CHECK (btrim("title") <> '');

ALTER TABLE "certificate_translations"
  ADD CONSTRAINT "certificate_translations_title_not_blank"
  CHECK (btrim("title") <> '');

ALTER TABLE "category_translations"
  ADD CONSTRAINT "category_translations_not_blank"
  CHECK (btrim("name") <> '' AND btrim("slug") <> '');

ALTER TABLE "tag_translations"
  ADD CONSTRAINT "tag_translations_not_blank"
  CHECK (btrim("name") <> '' AND btrim("slug") <> '');

ALTER TABLE "skill_category_translations"
  ADD CONSTRAINT "skill_category_translations_name_not_blank"
  CHECK (btrim("name") <> '');

ALTER TABLE "users"
  ADD CONSTRAINT "users_email_normalized"
  CHECK ("email" LIKE '%@%' AND "email" = btrim("email"));

-- ---------------------------------------------------------------------------
-- Contact
-- ---------------------------------------------------------------------------

ALTER TABLE "contact_messages"
  ADD CONSTRAINT "contact_messages_deletion_after_creation"
  CHECK ("deletionDueAt" > "createdAt");

ALTER TABLE "contact_messages"
  ADD CONSTRAINT "contact_messages_sent_has_timestamp"
  CHECK ("deliveryStatus" <> 'SENT' OR "deliveredAt" IS NOT NULL);

-- ---------------------------------------------------------------------------
-- Sessions
-- ---------------------------------------------------------------------------

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_expiry_after_creation"
  CHECK ("expiresAt" > "createdAt");

-- Partial index over live sessions only. The session lookup on every
-- authenticated request touches this and nothing else, and revoked and expired
-- rows are retained for the audit window rather than deleted, so without the
-- predicate the index grows without bound.
CREATE INDEX "sessions_active_lookup"
  ON "sessions" ("tokenHash")
  WHERE "revokedAt" IS NULL;

-- ---------------------------------------------------------------------------
-- Public read paths
-- ---------------------------------------------------------------------------

-- Partial indexes matching the shape of the public queries. Every public blog
-- read filters to PUBLISHED with complete authoritative source, so indexing only
-- those rows keeps the index proportional to what is actually served rather
-- than to everything ever drafted.
CREATE INDEX "post_translations_public_listing"
  ON "post_translations" ("locale", "publishedAt" DESC)
  WHERE "status" = 'PUBLISHED' AND "bodyMarkdown" IS NOT NULL AND "bodySha256" IS NOT NULL AND "archivedAt" IS NULL;

CREATE INDEX "post_translations_public_slug"
  ON "post_translations" ("locale", "slug")
  WHERE "status" = 'PUBLISHED' AND "bodyMarkdown" IS NOT NULL AND "bodySha256" IS NOT NULL AND "archivedAt" IS NULL;

-- The scheduler's only query: what is due to publish now.
CREATE INDEX "post_translations_due_for_publication"
  ON "post_translations" ("scheduledFor")
  WHERE "status" = 'SCHEDULED';

-- ---------------------------------------------------------------------------
-- Content job queue
-- ---------------------------------------------------------------------------

-- What actually serializes work per post. Ordering matters within a lock key:
-- an apply for a translation must not overtake an earlier one. Enforcing it
-- here rather than in the claim query means two workers racing produce a
-- unique violation the loser retries, instead of two handlers interleaving on
-- a snapshot that looked free to both of them.
CREATE UNIQUE INDEX "content_jobs_one_claim_per_lock_key"
  ON "content_jobs" ("lockKey")
  WHERE "state" = 'CLAIMED';

-- Collapses a burst. Ten pushes in a minute should queue one reconciliation,
-- not ten identical whole-tree passes. NULL dedupe keys are exempt, because
-- SQL treats every NULL as distinct and "always queue me" is a real need.
CREATE UNIQUE INDEX "content_jobs_pending_dedupe"
  ON "content_jobs" ("dedupeKey")
  WHERE "dedupeKey" IS NOT NULL AND "state" = 'PENDING';

-- The claim query's index: pending work that has come due, oldest first.
CREATE INDEX "content_jobs_claimable"
  ON "content_jobs" ("availableAt")
  WHERE "state" = 'PENDING';

-- The recovery query's index: claims whose lease has lapsed.
CREATE INDEX "content_jobs_expired_leases"
  ON "content_jobs" ("leaseExpiresAt")
  WHERE "state" = 'CLAIMED';

ALTER TABLE "content_jobs"
  ADD CONSTRAINT "content_jobs_attempt_bounds"
  CHECK ("attempts" >= 0 AND "maxAttempts" >= 1 AND "attempts" <= "maxAttempts");

-- A claim without a lease is a job no one can ever reclaim: the worker that
-- took it can die and the row stays CLAIMED forever. Written as an equivalence
-- rather than two implications so a NULL cannot slip through three-valued
-- logic on the unchecked side.
ALTER TABLE "content_jobs"
  ADD CONSTRAINT "content_jobs_claim_has_lease"
  CHECK (
    ("state" = 'CLAIMED') = ("leaseExpiresAt" IS NOT NULL AND "claimedBy" IS NOT NULL)
  );

-- A terminal state has a finish time and a live one does not, so queue age is
-- always computable without asking which columns to trust.
ALTER TABLE "content_jobs"
  ADD CONSTRAINT "content_jobs_terminal_has_finished_at"
  CHECK (
    ("state" IN ('SUCCEEDED', 'DEAD')) = ("finishedAt" IS NOT NULL)
  );

-- Dead means attempts were actually exhausted. Without this a bug could
-- dead-letter a job on its first failure and the retry budget would be a
-- suggestion rather than a rule.
ALTER TABLE "content_jobs"
  ADD CONSTRAINT "content_jobs_dead_only_when_exhausted"
  CHECK ("state" <> 'DEAD' OR "attempts" >= "maxAttempts");
