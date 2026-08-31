/**
 * `@portfolio/database` — Prisma schema, migrations, and the PostgreSQL client.
 *
 * **Server-only.** Nothing that runs in a browser may import this package. The
 * connection string, the pool, and every credential live behind this boundary,
 * and `@portfolio/contracts` exists so the two sides can share validation
 * without sharing this.
 *
 * The generated client is emitted to `generated/client` by `prisma generate`
 * and is git-ignored, so a clean checkout must run `pnpm db:generate` before
 * this package will build.
 */
export {
  createAdvisoryLockPool,
  createDatabaseClient,
  disconnectDatabase,
  getDatabaseClient,
  type Database,
  type DatabaseConfig,
} from "./client.js";

export {
  ADVISORY_LOCKS,
  advisoryLockKey,
  OptimisticConcurrencyError,
  updateWithVersion,
  withAdvisoryLock,
  type AdvisoryLockPool,
  type TransactionCapable,
  type VersionedDelegate,
} from "./concurrency.js";

export {
  createLegacyGitHubStatsMigrationStore,
  createLegacyMigrationStore,
  createLegacyPageSectionMigrationStore,
  createLegacySkillColorMigrationStore,
} from "./legacy-migration.js";
export {
  ArticleVersionConflictError,
  createArticleStore,
  enqueueDuePublications,
  publishDueTranslation,
  type ArticleSaveOrigin,
  type SavedArticleTranslation,
} from "./articles.js";
export {
  ArticleRestoreRefusedError,
  buildCurrentFrontmatter,
  buildRestoreFrontmatter,
  parseArticleRevisionSnapshot,
  readArticleRestoreTarget,
  restoreArticleRevision,
  type ArticleRestoreTarget,
  type ArticleRevisionSnapshot,
} from "./article-restore.js";
export {
  createBlogTaxonomyStore,
  TaxonomyNotFoundError,
  TaxonomyVersionConflictError,
  type TaxonomyKind,
} from "./blog-taxonomy.js";
export {
  ArticleTransitionRefusedError,
  articlePathFor,
  digestMatches,
  type TransitionResult,
} from "./article-lifecycle.js";
export {
  createInvalidationOutboxStore,
  type ClaimedInvalidation,
  type InvalidationOutboxMetrics,
  type InvalidationOutboxStore,
} from "./content-outbox.js";
export {
  createContentJobStore,
  createPrismaSqlExecutor,
  retryDelaySeconds,
  type ClaimedContentJob,
  type ContentJobKind,
  type ContentJobStore,
  type ContentQueueMetrics,
  type SqlExecutor,
} from "./content-jobs.js";
export { createPasswordLoginStore } from "./auth.js";
export { createWebAuthnChallengeStore } from "./webauthn.js";
