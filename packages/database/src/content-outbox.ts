import type { SqlExecutor } from "./content-jobs.js";

/**
 * The invalidation outbox drain (ADR-012).
 *
 * The outbox row is written inside the same transaction that applies the
 * content change, which is the whole point: a publish that commits and then
 * fails to tell the web app is a stale page, not a lost publish, and the
 * database stays authoritative either way. Delivery is a separate, retried step.
 *
 * Unlike `content_jobs` this table has no lease column and no CLAIMED state, so
 * the claim uses `nextAttemptAt` as a visibility timeout: taking a row pushes
 * its next attempt into the future, and a worker that dies before settling it
 * simply leaves it to become visible again. That needs no schema change and
 * behaves identically for the one property that matters — a row is never
 * invisible forever.
 */

export interface ClaimedInvalidation {
  readonly id: string;
  readonly cacheTag: string;
  readonly payload: unknown;
  /** Includes the attempt now in progress. */
  readonly attempts: number;
}

export interface InvalidationOutboxMetrics {
  readonly pending: number;
  readonly failed: number;
  readonly oldestPendingAgeSeconds: number | null;
}

export interface InvalidationOutboxStore {
  claim(input: {
    readonly maxAttempts: number;
    readonly visibilitySeconds: number;
    readonly limit?: number;
  }): Promise<readonly ClaimedInvalidation[]>;
  markDelivered(id: string): Promise<void>;
  /** Returns whether the retry budget is now spent. */
  reschedule(input: {
    readonly id: string;
    readonly maxAttempts: number;
    readonly delaySeconds: number;
  }): Promise<"retrying" | "failed">;
  metrics(): Promise<InvalidationOutboxMetrics>;
}

export function createInvalidationOutboxStore(
  executor: SqlExecutor
): InvalidationOutboxStore {
  return {
    claim: async (input) => {
      const rows = await executor.query<{
        id: string;
        cacheTag: string;
        payload: unknown;
        attempts: number | bigint;
      }>(
        `WITH claimable AS (
           SELECT o."id"
           FROM "content_invalidation_outbox" o
           WHERE o."state" = 'PENDING'
             AND o."nextAttemptAt" <= now()
             AND o."attempts" < $1
           ORDER BY o."createdAt"
           FOR UPDATE SKIP LOCKED
           LIMIT $2
         )
         UPDATE "content_invalidation_outbox" AS target
         SET "attempts" = target."attempts" + 1,
             "nextAttemptAt" = now() + make_interval(secs => $3::double precision)
         FROM claimable
         WHERE target."id" = claimable."id"
         RETURNING target."id", target."cacheTag", target."payload",
                   target."attempts"`,
        [input.maxAttempts, input.limit ?? 20, input.visibilitySeconds]
      );
      return rows.map((row) => ({
        id: row.id,
        cacheTag: row.cacheTag,
        payload: row.payload,
        attempts: Number(row.attempts),
      }));
    },

    markDelivered: async (id) => {
      await executor.query(
        `UPDATE "content_invalidation_outbox"
         SET "state" = 'DELIVERED', "deliveredAt" = now()
         WHERE "id" = $1`,
        [id]
      );
    },

    reschedule: async (input) => {
      const rows = await executor.query<{ state: string }>(
        `UPDATE "content_invalidation_outbox"
         SET "state" = CASE
               WHEN "attempts" >= $2 THEN 'FAILED'::"OutboxState"
               ELSE 'PENDING'::"OutboxState"
             END,
             "nextAttemptAt" = now() + make_interval(secs => $3::double precision)
         WHERE "id" = $1
         RETURNING "state"`,
        [input.id, input.maxAttempts, input.delaySeconds]
      );
      return rows[0]?.state === "FAILED" ? "failed" : "retrying";
    },

    metrics: async () => {
      const rows = await executor.query<{
        pending: number | bigint;
        failed: number | bigint;
        oldest_pending_age: number | string | null;
      }>(
        `SELECT
           count(*) FILTER (WHERE "state" = 'PENDING') AS pending,
           count(*) FILTER (WHERE "state" = 'FAILED') AS failed,
           EXTRACT(EPOCH FROM (now() - min("createdAt") FILTER (
             WHERE "state" = 'PENDING'
           ))) AS oldest_pending_age
         FROM "content_invalidation_outbox"`
      );
      const row = rows[0];
      return {
        pending: Number(row?.pending ?? 0),
        failed: Number(row?.failed ?? 0),
        oldestPendingAgeSeconds:
          row?.oldest_pending_age === null ||
          row?.oldest_pending_age === undefined
            ? null
            : Number(row.oldest_pending_age),
      };
    },
  };
}
