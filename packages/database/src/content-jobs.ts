import { randomUUID } from "node:crypto";

import type { TransactionCapable } from "./concurrency.js";

/**
 * The PostgreSQL-backed job queue from
 * [ADR-013](../../../docs/DECISIONS.md#adr-013--postgresql-backed-jobs-with-dedicated-sync-and-scheduler-workers).
 *
 * Every statement here is raw SQL rather than a Prisma call, for one reason:
 * the whole design rests on `FOR UPDATE SKIP LOCKED`, partial unique indexes,
 * and `ON CONFLICT` against a partial index. None of that survives an ORM, and
 * a queue whose exclusion is approximated in application code is a queue that
 * runs the same job twice under load.
 *
 * The store is defined against a two-method SQL port instead of the Prisma
 * client so the claim semantics can be proven against a real PostgreSQL — see
 * `test/content-jobs.spec.ts`, which runs these exact statements under PGlite.
 * Testing a queue against a mock proves the mock.
 */

export interface SqlExecutor {
  query<R = unknown>(
    sql: string,
    params?: readonly unknown[]
  ): Promise<readonly R[]>;
}

/** Adapts the Prisma client to the port. Values are bound, never interpolated. */
export function createPrismaSqlExecutor(db: TransactionCapable): SqlExecutor {
  return {
    query: (sql, params = []) => db.$queryRawUnsafe(sql, ...params),
  };
}

export type ContentJobKind = "PUBLISH_DUE";

export interface ClaimedContentJob {
  readonly id: string;
  readonly kind: ContentJobKind;
  readonly lockKey: string;
  readonly payload: unknown;
  /** Includes the attempt now in progress, so the first claim reads 1. */
  readonly attempts: number;
  readonly maxAttempts: number;
}

export interface ContentQueueMetrics {
  readonly pending: number;
  readonly claimed: number;
  readonly dead: number;
  /** Claims whose lease has lapsed; a persistent non-zero means a sick worker. */
  readonly expiredLeases: number;
  /**
   * Age of the oldest job that is due and still waiting, in seconds.
   *
   * Null when nothing is due — deliberately distinct from zero, because "the
   * queue is empty" and "the queue is current" are different operational
   * facts and a readiness check should not conflate them.
   */
  readonly oldestPendingAgeSeconds: number | null;
}

export interface ContentJobStore {
  enqueue(input: {
    readonly kind: ContentJobKind;
    readonly lockKey: string;
    readonly dedupeKey?: string | null;
    readonly payload?: unknown;
    readonly availableAt?: Date;
    readonly maxAttempts?: number;
  }): Promise<"queued" | "deduplicated">;
  claim(input: {
    readonly worker: string;
    readonly leaseSeconds: number;
  }): Promise<ClaimedContentJob | null>;
  succeed(id: string): Promise<void>;
  fail(input: {
    readonly id: string;
    readonly error: string;
    readonly delaySeconds?: number;
  }): Promise<"retrying" | "dead">;
  /** Extends a lease mid-job. False means the claim was already lost. */
  heartbeat(input: {
    readonly id: string;
    readonly worker: string;
    readonly leaseSeconds: number;
  }): Promise<boolean>;
  /** Dead-letters claims that lapsed with no attempts left. Returns the count. */
  reapExhaustedLeases(): Promise<number>;
  metrics(): Promise<ContentQueueMetrics>;
}

/** Truncated so a verbose driver error cannot turn a job row into a log sink. */
const MAX_ERROR_LENGTH = 1_000;

const DEFAULT_MAX_ATTEMPTS = 5;

/**
 * Exponential backoff, capped.
 *
 * Pure and exported because it is the one part of the retry policy worth
 * asserting directly: everything else needs a database, and a backoff that
 * silently becomes linear is the kind of bug that only shows up as a thundering
 * herd against the Git API during an outage.
 *
 * No jitter. A single sync worker holds the advisory lock, so there is no fleet
 * to disperse, and a deterministic schedule is one an operator can predict.
 */
export function retryDelaySeconds(
  attempt: number,
  options: { readonly baseSeconds?: number; readonly capSeconds?: number } = {}
): number {
  const base = options.baseSeconds ?? 15;
  const cap = options.capSeconds ?? 3_600;
  if (attempt < 1) return base;
  return Math.min(cap, base * 2 ** (attempt - 1));
}

export function createContentJobStore(executor: SqlExecutor): ContentJobStore {
  return {
    enqueue: async (input) => {
      const rows = await executor.query<{ id: string }>(
        `INSERT INTO "content_jobs"
           ("id", "kind", "lockKey", "dedupeKey", "payload", "state",
            "attempts", "maxAttempts", "availableAt", "createdAt", "updatedAt")
         VALUES ($1, $2::"ContentJobKind", $3, $4, $5::jsonb, 'PENDING',
                 0, $6, COALESCE($7::timestamptz, now()), now(), now())
         ON CONFLICT ("dedupeKey")
           WHERE "dedupeKey" IS NOT NULL AND "state" = 'PENDING'
           DO NOTHING
         RETURNING "id"`,
        [
          // Raw SQL bypasses Prisma's cuid(2) default, so the id is generated
          // here. The column is opaque text; nothing parses its format.
          randomUUID(),
          input.kind,
          input.lockKey,
          input.dedupeKey ?? null,
          JSON.stringify(input.payload ?? {}),
          input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
          input.availableAt?.toISOString() ?? null,
        ]
      );
      return rows.length > 0 ? "queued" : "deduplicated";
    },

    claim: async (input) => {
      const rows = await executor.query<{
        id: string;
        kind: ContentJobKind;
        lockKey: string;
        payload: unknown;
        attempts: number | bigint;
        maxAttempts: number | bigint;
      }>(
        // The CTE selects, the UPDATE claims. `SKIP LOCKED` is what lets a
        // second worker walk past a row the first is already taking instead of
        // blocking behind it.
        //
        // The NOT EXISTS enforces per-lock-key ordering optimistically; the
        // unique index on ("lockKey") WHERE state = 'CLAIMED' enforces it
        // actually. Both are here because the subquery reads a snapshot, so two
        // workers can pass it in the same instant — one of them then loses on
        // the index and calls again, which is the intended outcome.
        `WITH claimable AS (
           SELECT j."id"
           FROM "content_jobs" j
           WHERE j."attempts" < j."maxAttempts"
             AND (
                  (j."state" = 'PENDING' AND j."availableAt" <= now())
               OR (j."state" = 'CLAIMED' AND j."leaseExpiresAt" <= now())
             )
             AND NOT EXISTS (
               SELECT 1
               FROM "content_jobs" busy
               WHERE busy."lockKey" = j."lockKey"
                 AND busy."state" = 'CLAIMED'
                 AND busy."leaseExpiresAt" > now()
             )
           ORDER BY j."availableAt", j."createdAt"
           FOR UPDATE SKIP LOCKED
           LIMIT 1
         )
         UPDATE "content_jobs" AS target
         SET "state" = 'CLAIMED',
             "claimedBy" = $1,
             "leaseExpiresAt" = now() + make_interval(secs => $2::double precision),
             "attempts" = target."attempts" + 1,
             "updatedAt" = now()
         FROM claimable
         WHERE target."id" = claimable."id"
         RETURNING target."id", target."kind", target."lockKey",
                   target."payload", target."attempts", target."maxAttempts"`,
        [input.worker, input.leaseSeconds]
      );
      const row = rows[0];
      if (row === undefined) return null;
      return {
        id: row.id,
        kind: row.kind,
        lockKey: row.lockKey,
        payload: row.payload,
        attempts: Number(row.attempts),
        maxAttempts: Number(row.maxAttempts),
      };
    },

    succeed: async (id) => {
      await executor.query(
        `UPDATE "content_jobs"
         SET "state" = 'SUCCEEDED', "finishedAt" = now(), "updatedAt" = now(),
             "leaseExpiresAt" = NULL, "claimedBy" = NULL, "lastError" = NULL
         WHERE "id" = $1`,
        [id]
      );
    },

    fail: async (input) => {
      // One statement, so the retry/dead-letter decision is made against the
      // row's own attempt count rather than against a value read a moment ago.
      const rows = await executor.query<{ state: string }>(
        `UPDATE "content_jobs"
         SET "state" = CASE
               WHEN "attempts" >= "maxAttempts" THEN 'DEAD'::"ContentJobState"
               ELSE 'PENDING'::"ContentJobState"
             END,
             "finishedAt" = CASE
               WHEN "attempts" >= "maxAttempts" THEN now()
               ELSE NULL
             END,
             "availableAt" = CASE
               WHEN "attempts" >= "maxAttempts" THEN "availableAt"
               ELSE now() + make_interval(secs => $2::double precision)
             END,
             "leaseExpiresAt" = NULL,
             "claimedBy" = NULL,
             "lastError" = $3,
             "updatedAt" = now()
         WHERE "id" = $1
         RETURNING "state"`,
        [
          input.id,
          input.delaySeconds ?? null,
          input.error.slice(0, MAX_ERROR_LENGTH),
        ]
      );
      return rows[0]?.state === "DEAD" ? "dead" : "retrying";
    },

    heartbeat: async (input) => {
      const rows = await executor.query<{ id: string }>(
        // Scoped to the claiming worker: if the lease already lapsed and
        // someone else took the job, extending it here would give two workers a
        // live claim on the same row.
        `UPDATE "content_jobs"
         SET "leaseExpiresAt" = now() + make_interval(secs => $3::double precision),
             "updatedAt" = now()
         WHERE "id" = $1 AND "claimedBy" = $2 AND "state" = 'CLAIMED'
         RETURNING "id"`,
        [input.id, input.worker, input.leaseSeconds]
      );
      return rows.length > 0;
    },

    reapExhaustedLeases: async () => {
      // A job whose worker died on its final attempt is unreachable by `claim`,
      // which requires attempts < maxAttempts. Without this sweep it would sit
      // CLAIMED forever and never surface as a failure.
      const rows = await executor.query<{ id: string }>(
        `UPDATE "content_jobs"
         SET "state" = 'DEAD', "finishedAt" = now(), "updatedAt" = now(),
             "leaseExpiresAt" = NULL, "claimedBy" = NULL,
             "lastError" = COALESCE("lastError", 'Lease expired with no attempts remaining.')
         WHERE "state" = 'CLAIMED'
           AND "leaseExpiresAt" <= now()
           AND "attempts" >= "maxAttempts"
         RETURNING "id"`
      );
      return rows.length;
    },

    metrics: async () => {
      const rows = await executor.query<{
        pending: number | bigint;
        claimed: number | bigint;
        dead: number | bigint;
        expired_leases: number | bigint;
        oldest_pending_age: number | string | null;
      }>(
        `SELECT
           count(*) FILTER (WHERE "state" = 'PENDING') AS pending,
           count(*) FILTER (WHERE "state" = 'CLAIMED') AS claimed,
           count(*) FILTER (WHERE "state" = 'DEAD') AS dead,
           count(*) FILTER (
             WHERE "state" = 'CLAIMED' AND "leaseExpiresAt" <= now()
           ) AS expired_leases,
           EXTRACT(EPOCH FROM (now() - min("availableAt") FILTER (
             WHERE "state" = 'PENDING' AND "availableAt" <= now()
           ))) AS oldest_pending_age
         FROM "content_jobs"`
      );
      const row = rows[0];
      return {
        pending: Number(row?.pending ?? 0),
        claimed: Number(row?.claimed ?? 0),
        dead: Number(row?.dead ?? 0),
        expiredLeases: Number(row?.expired_leases ?? 0),
        oldestPendingAgeSeconds:
          row?.oldest_pending_age === null ||
          row?.oldest_pending_age === undefined
            ? null
            : Number(row.oldest_pending_age),
      };
    },
  };
}
