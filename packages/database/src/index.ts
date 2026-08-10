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
  type TransactionCapable,
  type VersionedDelegate,
} from "./concurrency.js";
