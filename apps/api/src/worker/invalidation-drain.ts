import {
  invalidationEventSchema,
  type InvalidationEvent,
} from "@portfolio/contracts/content";
import {
  retryDelaySeconds,
  type InvalidationOutboxStore,
} from "@portfolio/database";

import type { InvalidationSender } from "./invalidation-sender.js";

/**
 * Delivers queued invalidation events with bounded retries (ADR-012, as
 * retained by ADR-015).
 *
 * Runs alongside the job loop rather than inside it. The two have unrelated
 * failure modes — one talks to PostgreSQL, the other to the web app over the
 * network — and putting them in one sequence means a slow or retrying purge
 * delays every pending publication behind it, and vice versa.
 *
 * Nothing here is allowed to fail loudly enough to stop the loop. The database
 * is authoritative (API_SPEC.md §8); an undelivered invalidation is a stale
 * page that its revalidate window will eventually correct, and turning it into
 * a crash would take out the reconciliation running next to it as well.
 */

export interface InvalidationDrainOptions {
  readonly outbox: InvalidationOutboxStore;
  readonly sender: InvalidationSender;
  readonly maxAttempts: number;
  /** How long a claimed row stays invisible before another worker may retake it. */
  readonly visibilitySeconds: number;
  readonly batchSize: number;
  readonly idleDelayMs: number;
  readonly sleep: (ms: number) => Promise<void>;
  readonly running: () => boolean;
  readonly log?: (event: InvalidationDrainEvent) => void;
}

export type InvalidationDrainEvent =
  | { readonly type: "delivered"; readonly id: string; readonly tags: number }
  | {
      readonly type: "undelivered";
      readonly id: string;
      readonly outcome: "retrying" | "failed";
      readonly attempts: number;
      readonly detail: string;
    }
  | { readonly type: "unreadable"; readonly id: string };

export interface InvalidationDrainSummary {
  readonly delivered: number;
  readonly retried: number;
  readonly failed: number;
  readonly unreadable: number;
}

export async function runInvalidationDrain(
  options: InvalidationDrainOptions
): Promise<InvalidationDrainSummary> {
  let delivered = 0;
  let retried = 0;
  let failed = 0;
  let unreadable = 0;

  while (options.running()) {
    const batch = await options.outbox.claim({
      maxAttempts: options.maxAttempts,
      visibilitySeconds: options.visibilitySeconds,
      limit: options.batchSize,
    });

    if (batch.length === 0) {
      await options.sleep(options.idleDelayMs);
      continue;
    }

    for (const row of batch) {
      const event = parseEvent(row.payload);
      if (event === null) {
        // A row we cannot parse will never become deliverable, so retrying it
        // until the budget runs out is pure noise. Exhaust it immediately and
        // let it show up as failed.
        unreadable += 1;
        failed += 1;
        options.log?.({ type: "unreadable", id: row.id });
        await options.outbox.reschedule({
          id: row.id,
          maxAttempts: 0,
          delaySeconds: 0,
        });
        continue;
      }

      const result = await options.sender.send(event);
      if (result.ok) {
        await options.outbox.markDelivered(row.id);
        delivered += 1;
        options.log?.({
          type: "delivered",
          id: row.id,
          tags: event.tags.length,
        });
        continue;
      }

      const outcome = await options.outbox.reschedule({
        id: row.id,
        maxAttempts: options.maxAttempts,
        delaySeconds: retryDelaySeconds(row.attempts),
      });
      if (outcome === "failed") failed += 1;
      else retried += 1;
      options.log?.({
        type: "undelivered",
        id: row.id,
        outcome,
        attempts: row.attempts,
        detail: result.detail ?? "unknown",
      });
    }
  }

  return { delivered, retried, failed, unreadable };
}

function parseEvent(payload: unknown): InvalidationEvent | null {
  const parsed = invalidationEventSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}
