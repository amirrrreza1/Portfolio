-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('en', 'fa');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'EDITOR');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'LOCKED', 'DISABLED');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "NavTargetKind" AS ENUM ('SECTION_ANCHOR', 'INTERNAL_ROUTE');

-- CreateEnum
CREATE TYPE "SocialLinkKind" AS ENUM ('SOCIAL', 'EMAIL', 'DONATE');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "MediaProcessingState" AS ENUM ('PENDING', 'VERIFIED', 'QUARANTINED', 'FAILED');

-- CreateEnum
CREATE TYPE "MediaVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "TranslationStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SyncState" AS ENUM ('SYNCED', 'PENDING', 'SYNC_FAILED', 'MISSING_IN_GIT', 'FRONTMATTER_DRIFT');

-- CreateEnum
CREATE TYPE "SyncTrigger" AS ENUM ('ADMIN_SAVE', 'WEBHOOK', 'RECONCILE', 'SCHEDULER_BOT', 'IMPORT');

-- CreateEnum
CREATE TYPE "SyncOutcome" AS ENUM ('SUCCESS', 'PARTIAL', 'FAILURE');

-- CreateEnum
CREATE TYPE "ContentWriteOperationState" AS ENUM ('PENDING', 'GIT_COMMITTED', 'APPLIED', 'FAILED');

-- CreateEnum
CREATE TYPE "OutboxState" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "WebAuthnChallengePurpose" AS ENUM ('LOGIN', 'ENROLL', 'REAUTH');

-- CreateEnum
CREATE TYPE "RevisionAction" AS ENUM ('CREATE', 'UPDATE', 'ARCHIVE', 'RESTORE', 'DELETE');

-- CreateEnum
CREATE TYPE "AuditOutcome" AS ENUM ('SUCCESS', 'FAILURE');

-- CreateEnum
CREATE TYPE "ContactDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SUPPRESSED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'EDITOR',
    "passwordHash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "passwordChangedAt" TIMESTAMPTZ(6) NOT NULL,
    "lastLoginAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webauthn_credentials" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT[],
    "deviceType" TEXT,
    "backedUp" BOOLEAN NOT NULL DEFAULT false,
    "label" TEXT,
    "lastUsedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "webauthn_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webauthn_challenges" (
    "id" TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "purpose" "WebAuthnChallengePurpose" NOT NULL,
    "userId" TEXT,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webauthn_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrfBindingHash" TEXT NOT NULL,
    "ipPrefixHash" TEXT,
    "userAgentSummary" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "revokedAt" TIMESTAMPTZ(6),
    "revokedReason" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMPTZ(6),

    CONSTRAINT "recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "canonicalSiteUrl" TEXT NOT NULL,
    "defaultLocale" "Locale" NOT NULL DEFAULT 'en',
    "enabledLocales" "Locale"[] DEFAULT ARRAY['en', 'fa']::"Locale"[],
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "defaultSocialImageId" TEXT,
    "authorName" TEXT NOT NULL,
    "creatorName" TEXT NOT NULL,
    "publisherName" TEXT NOT NULL,
    "searchConsoleTokens" JSONB,
    "contactRecipientEmail" TEXT NOT NULL,
    "contactEnabled" BOOLEAN NOT NULL DEFAULT true,
    "contactRetentionDays" INTEGER NOT NULL DEFAULT 90,
    "githubUsername" TEXT,
    "githubRepoAllowlist" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "githubCacheTtlSeconds" INTEGER NOT NULL DEFAULT 3600,
    "robotsAllowIndexing" BOOLEAN NOT NULL DEFAULT true,
    "birthDate" DATE,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_settings_translations" (
    "id" TEXT NOT NULL,
    "siteSettingsId" INTEGER NOT NULL,
    "locale" "Locale" NOT NULL,
    "siteName" TEXT NOT NULL,
    "titleTemplate" TEXT NOT NULL,
    "metaDescription" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "site_settings_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appearance_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabledThemes" TEXT[],
    "defaultTheme" TEXT NOT NULL,
    "enabledBlogFonts" TEXT[],
    "defaultBlogFontByLocale" JSONB NOT NULL,
    "allowedBlogSizeSteps" TEXT[],
    "defaultBlogSizeStep" TEXT NOT NULL,
    "offerMotionToggle" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "appearance_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_sections" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "archivedAt" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "page_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_section_translations" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "title" TEXT,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "page_section_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nav_items" (
    "id" TEXT NOT NULL,
    "labelByLocale" JSONB NOT NULL,
    "targetKind" "NavTargetKind" NOT NULL,
    "target" TEXT NOT NULL,
    "iconKey" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "nav_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_links" (
    "id" TEXT NOT NULL,
    "labelByLocale" JSONB NOT NULL,
    "url" TEXT NOT NULL,
    "iconKey" TEXT,
    "rel" TEXT,
    "kind" "SocialLinkKind" NOT NULL DEFAULT 'SOCIAL',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "social_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL,
    "demoUrl" TEXT,
    "repositoryUrl" TEXT,
    "imageId" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "startedAt" DATE,
    "completedAt" DATE,
    "legacyId" INTEGER,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "archivedAt" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_translations" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "longDescription" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "project_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_categories" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "legacyId" INTEGER,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "skill_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_category_translations" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "skill_category_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "iconMediaId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "legacyId" INTEGER,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_skills" (
    "projectId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "project_skills_pkey" PRIMARY KEY ("projectId","skillId")
);

-- CreateTable
CREATE TABLE "certificates" (
    "id" TEXT NOT NULL,
    "issuerName" TEXT NOT NULL,
    "issuerUrl" TEXT,
    "instructorName" TEXT,
    "instructorUrl" TEXT,
    "scoreText" TEXT,
    "issuedAt" DATE NOT NULL,
    "credentialUrl" TEXT,
    "mediaId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "legacyId" INTEGER,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "archivedAt" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificate_translations" (
    "id" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "certificate_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "textByLocale" JSONB NOT NULL,
    "author" TEXT,
    "sourceUrl" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "legacyId" INTEGER,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" BIGINT NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "altText" TEXT,
    "processingState" "MediaProcessingState" NOT NULL DEFAULT 'PENDING',
    "visibility" "MediaVisibility" NOT NULL DEFAULT 'PUBLIC',
    "uploadedById" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "archivedAt" TIMESTAMPTZ(6),

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resume_versions" (
    "id" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "publicFilename" TEXT,
    "uploadedById" TEXT,
    "activatedAt" TIMESTAMPTZ(6),
    "retiredAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "resume_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" TEXT NOT NULL,
    "authorId" TEXT,
    "categoryId" TEXT,
    "coverMediaId" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "pinnedUntil" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "archivedAt" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_translations" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "excerpt" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "canonicalUrl" TEXT,
    "socialImageId" TEXT,
    "status" "TranslationStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMPTZ(6),
    "scheduledFor" TIMESTAMPTZ(6),
    "readingMinutes" INTEGER,
    "headingTree" JSONB,
    "renderedHtml" TEXT,
    "rendererVersion" TEXT,
    "sourceBlobSha" TEXT,
    "syncState" "SyncState" NOT NULL DEFAULT 'PENDING',
    "syncError" TEXT,
    "lastSyncedAt" TIMESTAMPTZ(6),
    "frontmatterSchemaVersion" INTEGER,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "archivedAt" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "post_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_drafts" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "authorId" TEXT NOT NULL,
    "bodyMarkdown" TEXT NOT NULL,
    "frontmatter" JSONB,
    "baseBlobSha" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "post_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_translations" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "category_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tag_translations" (
    "id" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tag_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_tags" (
    "postId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "post_tags_pkey" PRIMARY KEY ("postId","tagId")
);

-- CreateTable
CREATE TABLE "slug_redirects" (
    "id" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "fromPath" TEXT NOT NULL,
    "toPath" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL DEFAULT 308,
    "sourceEntityType" TEXT,
    "sourceEntityId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slug_redirects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_sync_logs" (
    "id" TEXT NOT NULL,
    "commitSha" TEXT,
    "trigger" "SyncTrigger" NOT NULL,
    "affectedPaths" TEXT[],
    "outcome" "SyncOutcome" NOT NULL,
    "errorSummary" TEXT,
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(6),

    CONSTRAINT "content_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_write_operations" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "path" TEXT NOT NULL,
    "expectedBlobSha" TEXT,
    "payloadSha256" TEXT NOT NULL,
    "commitSha" TEXT,
    "state" "ContentWriteOperationState" NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "content_write_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_apply_ledger" (
    "id" TEXT NOT NULL,
    "commitSha" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "blobSha" TEXT NOT NULL,
    "appliedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_apply_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "deliveryId" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("deliveryId")
);

-- CreateTable
CREATE TABLE "content_invalidation_outbox" (
    "id" TEXT NOT NULL,
    "operationId" TEXT,
    "cacheTag" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "state" "OutboxState" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_invalidation_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_migrations" (
    "version" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "report" JSONB NOT NULL,
    "appliedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_migrations_pkey" PRIMARY KEY ("version")
);

-- CreateTable
CREATE TABLE "content_revisions" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityVersion" INTEGER NOT NULL,
    "action" "RevisionAction" NOT NULL,
    "actorId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "eventType" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "outcome" "AuditOutcome" NOT NULL,
    "requestId" TEXT,
    "ipPrefixHash" TEXT,
    "userAgentHash" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_messages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "deliveryStatus" "ContactDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "providerMessageRef" TEXT,
    "abuseScore" INTEGER,
    "abuseReason" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMPTZ(6),
    "deletionDueAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "webauthn_credentials_credentialId_key" ON "webauthn_credentials"("credentialId");

-- CreateIndex
CREATE INDEX "webauthn_credentials_userId_idx" ON "webauthn_credentials"("userId");

-- CreateIndex
CREATE INDEX "webauthn_challenges_expiresAt_idx" ON "webauthn_challenges"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "sessions_revokedAt_idx" ON "sessions"("revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "recovery_codes_codeHash_key" ON "recovery_codes"("codeHash");

-- CreateIndex
CREATE INDEX "recovery_codes_userId_usedAt_idx" ON "recovery_codes"("userId", "usedAt");

-- CreateIndex
CREATE UNIQUE INDEX "site_settings_translations_siteSettingsId_locale_key" ON "site_settings_translations"("siteSettingsId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "page_sections_key_key" ON "page_sections"("key");

-- CreateIndex
CREATE INDEX "page_sections_enabled_sortOrder_idx" ON "page_sections"("enabled", "sortOrder");

-- CreateIndex
CREATE INDEX "page_section_translations_locale_idx" ON "page_section_translations"("locale");

-- CreateIndex
CREATE UNIQUE INDEX "page_section_translations_sectionId_locale_key" ON "page_section_translations"("sectionId", "locale");

-- CreateIndex
CREATE INDEX "nav_items_enabled_sortOrder_idx" ON "nav_items"("enabled", "sortOrder");

-- CreateIndex
CREATE INDEX "social_links_enabled_sortOrder_idx" ON "social_links"("enabled", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "projects_slug_key" ON "projects"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "projects_legacyId_key" ON "projects"("legacyId");

-- CreateIndex
CREATE INDEX "projects_enabled_sortOrder_idx" ON "projects"("enabled", "sortOrder");

-- CreateIndex
CREATE INDEX "projects_status_idx" ON "projects"("status");

-- CreateIndex
CREATE INDEX "projects_featured_sortOrder_idx" ON "projects"("featured", "sortOrder");

-- CreateIndex
CREATE INDEX "project_translations_locale_idx" ON "project_translations"("locale");

-- CreateIndex
CREATE UNIQUE INDEX "project_translations_projectId_locale_key" ON "project_translations"("projectId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "skill_categories_key_key" ON "skill_categories"("key");

-- CreateIndex
CREATE UNIQUE INDEX "skill_categories_legacyId_key" ON "skill_categories"("legacyId");

-- CreateIndex
CREATE INDEX "skill_categories_enabled_sortOrder_idx" ON "skill_categories"("enabled", "sortOrder");

-- CreateIndex
CREATE INDEX "skill_category_translations_locale_idx" ON "skill_category_translations"("locale");

-- CreateIndex
CREATE UNIQUE INDEX "skill_category_translations_categoryId_locale_key" ON "skill_category_translations"("categoryId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "skills_name_key" ON "skills"("name");

-- CreateIndex
CREATE UNIQUE INDEX "skills_legacyId_key" ON "skills"("legacyId");

-- CreateIndex
CREATE INDEX "skills_categoryId_sortOrder_idx" ON "skills"("categoryId", "sortOrder");

-- CreateIndex
CREATE INDEX "skills_enabled_idx" ON "skills"("enabled");

-- CreateIndex
CREATE INDEX "project_skills_skillId_idx" ON "project_skills"("skillId");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_legacyId_key" ON "certificates"("legacyId");

-- CreateIndex
CREATE INDEX "certificates_enabled_sortOrder_idx" ON "certificates"("enabled", "sortOrder");

-- CreateIndex
CREATE INDEX "certificate_translations_locale_idx" ON "certificate_translations"("locale");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_translations_certificateId_locale_key" ON "certificate_translations"("certificateId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_legacyId_key" ON "quotes"("legacyId");

-- CreateIndex
CREATE INDEX "quotes_enabled_sortOrder_idx" ON "quotes"("enabled", "sortOrder");

-- CreateIndex
CREATE INDEX "quotes_pinned_idx" ON "quotes"("pinned");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_storageKey_key" ON "media_assets"("storageKey");

-- CreateIndex
CREATE INDEX "media_assets_checksumSha256_idx" ON "media_assets"("checksumSha256");

-- CreateIndex
CREATE INDEX "media_assets_processingState_idx" ON "media_assets"("processingState");

-- CreateIndex
CREATE INDEX "media_assets_kind_visibility_idx" ON "media_assets"("kind", "visibility");

-- CreateIndex
CREATE INDEX "resume_versions_activatedAt_idx" ON "resume_versions"("activatedAt");

-- CreateIndex
CREATE INDEX "posts_categoryId_idx" ON "posts"("categoryId");

-- CreateIndex
CREATE INDEX "posts_featured_idx" ON "posts"("featured");

-- CreateIndex
CREATE INDEX "post_translations_locale_status_publishedAt_idx" ON "post_translations"("locale", "status", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "post_translations_status_scheduledFor_idx" ON "post_translations"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "post_translations_syncState_idx" ON "post_translations"("syncState");

-- CreateIndex
CREATE INDEX "post_translations_sourceBlobSha_idx" ON "post_translations"("sourceBlobSha");

-- CreateIndex
CREATE UNIQUE INDEX "post_translations_postId_locale_key" ON "post_translations"("postId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "post_translations_locale_slug_key" ON "post_translations"("locale", "slug");

-- CreateIndex
CREATE INDEX "post_drafts_updatedAt_idx" ON "post_drafts"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "post_drafts_postId_locale_authorId_key" ON "post_drafts"("postId", "locale", "authorId");

-- CreateIndex
CREATE UNIQUE INDEX "categories_key_key" ON "categories"("key");

-- CreateIndex
CREATE INDEX "categories_enabled_sortOrder_idx" ON "categories"("enabled", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "category_translations_categoryId_locale_key" ON "category_translations"("categoryId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "category_translations_locale_slug_key" ON "category_translations"("locale", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "tags_key_key" ON "tags"("key");

-- CreateIndex
CREATE INDEX "tags_enabled_sortOrder_idx" ON "tags"("enabled", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "tag_translations_tagId_locale_key" ON "tag_translations"("tagId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "tag_translations_locale_slug_key" ON "tag_translations"("locale", "slug");

-- CreateIndex
CREATE INDEX "post_tags_tagId_idx" ON "post_tags"("tagId");

-- CreateIndex
CREATE INDEX "slug_redirects_locale_toPath_idx" ON "slug_redirects"("locale", "toPath");

-- CreateIndex
CREATE UNIQUE INDEX "slug_redirects_locale_fromPath_key" ON "slug_redirects"("locale", "fromPath");

-- CreateIndex
CREATE INDEX "content_sync_logs_startedAt_idx" ON "content_sync_logs"("startedAt" DESC);

-- CreateIndex
CREATE INDEX "content_sync_logs_outcome_startedAt_idx" ON "content_sync_logs"("outcome", "startedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "content_write_operations_idempotencyKey_key" ON "content_write_operations"("idempotencyKey");

-- CreateIndex
CREATE INDEX "content_write_operations_postId_locale_idx" ON "content_write_operations"("postId", "locale");

-- CreateIndex
CREATE INDEX "content_write_operations_state_updatedAt_idx" ON "content_write_operations"("state", "updatedAt");

-- CreateIndex
CREATE INDEX "content_apply_ledger_blobSha_idx" ON "content_apply_ledger"("blobSha");

-- CreateIndex
CREATE UNIQUE INDEX "content_apply_ledger_commitSha_path_key" ON "content_apply_ledger"("commitSha", "path");

-- CreateIndex
CREATE INDEX "webhook_deliveries_expiresAt_idx" ON "webhook_deliveries"("expiresAt");

-- CreateIndex
CREATE INDEX "content_invalidation_outbox_state_nextAttemptAt_idx" ON "content_invalidation_outbox"("state", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "content_revisions_entityType_entityId_createdAt_idx" ON "content_revisions"("entityType", "entityId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "content_revisions_entityType_entityId_entityVersion_key" ON "content_revisions"("entityType", "entityId", "entityVersion");

-- CreateIndex
CREATE INDEX "audit_events_eventType_createdAt_idx" ON "audit_events"("eventType", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "audit_events_targetType_targetId_createdAt_idx" ON "audit_events"("targetType", "targetId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "audit_events_actorId_createdAt_idx" ON "audit_events"("actorId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "contact_messages_deliveryStatus_createdAt_idx" ON "contact_messages"("deliveryStatus", "createdAt");

-- CreateIndex
CREATE INDEX "contact_messages_deletionDueAt_idx" ON "contact_messages"("deletionDueAt");

-- AddForeignKey
ALTER TABLE "webauthn_credentials" ADD CONSTRAINT "webauthn_credentials_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_defaultSocialImageId_fkey" FOREIGN KEY ("defaultSocialImageId") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_settings_translations" ADD CONSTRAINT "site_settings_translations_siteSettingsId_fkey" FOREIGN KEY ("siteSettingsId") REFERENCES "site_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_section_translations" ADD CONSTRAINT "page_section_translations_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "page_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_translations" ADD CONSTRAINT "project_translations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_category_translations" ADD CONSTRAINT "skill_category_translations_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "skill_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "skill_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_iconMediaId_fkey" FOREIGN KEY ("iconMediaId") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_skills" ADD CONSTRAINT "project_skills_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_skills" ADD CONSTRAINT "project_skills_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_translations" ADD CONSTRAINT "certificate_translations_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "certificates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_versions" ADD CONSTRAINT "resume_versions_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_versions" ADD CONSTRAINT "resume_versions_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_coverMediaId_fkey" FOREIGN KEY ("coverMediaId") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_translations" ADD CONSTRAINT "post_translations_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_translations" ADD CONSTRAINT "post_translations_socialImageId_fkey" FOREIGN KEY ("socialImageId") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_drafts" ADD CONSTRAINT "post_drafts_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_drafts" ADD CONSTRAINT "post_drafts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_translations" ADD CONSTRAINT "category_translations_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tag_translations" ADD CONSTRAINT "tag_translations_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slug_redirects" ADD CONSTRAINT "slug_redirects_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
