import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/client/client.js";

/**
 * The pooled Prisma client.
 *
 * This module is server-only by construction and by policy. `@portfolio/web`
 * may import `@portfolio/contracts`; it must never import this package, and
 * M1's exit gate tests that boundary. A browser bundle that reaches the
 * database client has already lost, because the connection string travels with
 * it.
 */

export interface DatabaseConfig {
  readonly connectionString: string;
  /**
   * Maximum connections held by THIS process.
   *
   * The meaningful limit is PostgreSQL's `max_connections` divided across every
   * API replica, the scheduler, and the sync worker — not per process. Sizing
   * this from a single instance's needs is how a deployment that works at one
   * replica fails at three.
   */
  readonly maxConnections?: number;
  readonly connectionTimeoutMs?: number;
  readonly statementTimeoutMs?: number;
  readonly logQueries?: boolean;
}

const DEFAULTS = {
  maxConnections: 10,
  connectionTimeoutMs: 5_000,
  /**
   * A public read path that has not answered in ten seconds has already failed
   * from the visitor's perspective; letting the query continue only holds a
   * connection the next request needs.
   */
  statementTimeoutMs: 10_000,
} as const;

export type Database = PrismaClient;

export function createDatabaseClient(config: DatabaseConfig): Database {
  const {
    connectionString,
    maxConnections = DEFAULTS.maxConnections,
    connectionTimeoutMs = DEFAULTS.connectionTimeoutMs,
    statementTimeoutMs = DEFAULTS.statementTimeoutMs,
    logQueries = false,
  } = config;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required.");
  }

  const adapter = new PrismaPg({
    connectionString,
    max: maxConnections,
    connectionTimeoutMillis: connectionTimeoutMs,
    statement_timeout: statementTimeoutMs,
  });

  return new PrismaClient({
    adapter,
    log: logQueries ? ["query", "warn", "error"] : ["warn", "error"],
  });
}

/**
 * Process-wide singleton.
 *
 * Guarded through `globalThis` because a Next.js or Nest dev server reloads
 * modules on every change, and a fresh pool per reload exhausts
 * `max_connections` within a few minutes of editing. In production the module
 * is evaluated once and this is simply a module-level cache.
 */
const GLOBAL_KEY = Symbol.for("portfolio.database.client");

interface GlobalWithDatabase {
  [GLOBAL_KEY]?: Database;
}

export function getDatabaseClient(config: DatabaseConfig): Database {
  const container = globalThis as GlobalWithDatabase;
  const existing = container[GLOBAL_KEY];

  if (existing) return existing;

  const client = createDatabaseClient(config);
  container[GLOBAL_KEY] = client;
  return client;
}

export async function disconnectDatabase(): Promise<void> {
  const container = globalThis as GlobalWithDatabase;
  const client = container[GLOBAL_KEY];

  if (client) {
    await client.$disconnect();
    delete container[GLOBAL_KEY];
  }
}
