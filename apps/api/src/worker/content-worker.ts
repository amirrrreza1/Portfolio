import {
  retryDelaySeconds,
  type ClaimedContentJob,
  type ContentJobKind,
  type ContentJobStore,
} from "@portfolio/database";

/**
 * The sync worker's loop, with every dependency injected.
 *
 * ADR-013 puts this in its own process so a deploy or a horizontal scale-out
 * cannot duplicate, interrupt, or hide background work. The loop itself is kept
 * free of process concerns — no timers it owns, no signal handlers, no database
 * construction — because the interesting behaviour is claim/handle/settle, and
 * that is only testable if it can run without any of those.
 */

export interface ContentJobHandler {
  (job: ClaimedContentJob): Promise<void>;
}

export class UnsupportedJobKindError extends Error {
  constructor(kind: string) {
    super(`No handler is registered for job kind ${kind}.`);
    this.name = "UnsupportedJobKindError";
  }
}

export interface ContentWorkerOptions {
  readonly jobs: ContentJobStore;
  readonly handlers: Partial<Record<ContentJobKind, ContentJobHandler>>;
  readonly worker: string;
  readonly leaseSeconds: number;
  /** How long to wait after an empty claim before asking again. */
  readonly idleDelayMs: number;
  readonly sleep: (ms: number) => Promise<void>;
  /** False ends the loop; the process supplies signal handling. */
  readonly running: () => boolean;
  readonly log?: (event: WorkerEvent) => void;
}

export type WorkerEvent =
  | { readonly type: "claimed"; readonly id: string; readonly kind: string }
  | { readonly type: "succeeded"; readonly id: string }
  | {
      readonly type: "failed";
      readonly id: string;
      readonly outcome: "retrying" | "dead";
      readonly attempts: number;
      readonly reason: string;
    }
  | { readonly type: "reaped"; readonly count: number };

export interface WorkerRunSummary {
  readonly claimed: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly deadLettered: number;
  readonly reaped: number;
}

/**
 * Claims and settles jobs until `running()` goes false.
 *
 * Every job settles exactly once. A handler that throws is a failure with a
 * backoff, not a crash: a worker that dies on the first bad job stops doing all
 * the other work too, and the job it died on stays CLAIMED until its lease
 * lapses. Both are worse than recording the error and moving on.
 */
export async function runContentWorker(
  options: ContentWorkerOptions
): Promise<WorkerRunSummary> {
  let claimed = 0;
  let succeeded = 0;
  let failed = 0;
  let deadLettered = 0;
  let reaped = 0;

  while (options.running()) {
    // Before claiming: a claim whose worker died on its last attempt is
    // invisible to claim() and would otherwise sit CLAIMED forever.
    const swept = await options.jobs.reapExhaustedLeases();
    if (swept > 0) {
      reaped += swept;
      options.log?.({ type: "reaped", count: swept });
    }

    const job = await options.jobs.claim({
      worker: options.worker,
      leaseSeconds: options.leaseSeconds,
    });

    if (job === null) {
      await options.sleep(options.idleDelayMs);
      continue;
    }

    claimed += 1;
    options.log?.({ type: "claimed", id: job.id, kind: job.kind });

    const handler = options.handlers[job.kind];
    try {
      if (handler === undefined) throw new UnsupportedJobKindError(job.kind);
      await handler(job);
      await options.jobs.succeed(job.id);
      succeeded += 1;
      options.log?.({ type: "succeeded", id: job.id });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown error";
      const outcome = await options.jobs.fail({
        id: job.id,
        error: reason,
        delaySeconds: retryDelaySeconds(job.attempts),
      });
      failed += 1;
      if (outcome === "dead") deadLettered += 1;
      options.log?.({
        type: "failed",
        id: job.id,
        outcome,
        attempts: job.attempts,
        reason,
      });
    }
  }

  return { claimed, succeeded, failed, deadLettered, reaped };
}

export interface SchedulerOptions {
  readonly jobs: ContentJobStore;
  readonly intervalMs: number;
  readonly sleep: (ms: number) => Promise<void>;
  readonly running: () => boolean;
  readonly log?: (event: { readonly type: "enqueued" | "skipped" }) => void;
}

/**
 * The periodic whole-tree reconciliation.
 *
 * This is what makes a missed webhook self-heal (CONTENT_PIPELINE.md §7), so it
 * is not an optimisation — without it, one dropped delivery leaves an article
 * permanently absent from the index with nothing reporting it.
 *
 * The dedupe key means a tick that lands while the previous reconciliation is
 * still queued does nothing, rather than stacking passes that all read the same
 * tree.
 */
export async function runContentScheduler(
  options: SchedulerOptions
): Promise<{ readonly enqueued: number; readonly skipped: number }> {
  let enqueued = 0;
  let skipped = 0;

  while (options.running()) {
    const outcome = await options.jobs.enqueue({
      kind: "SCHEDULED_RECONCILE",
      lockKey: CONTENT_HEAD_LOCK_KEY,
      dedupeKey: SCHEDULED_RECONCILE_DEDUPE_KEY,
      payload: { reason: "schedule" },
    });
    if (outcome === "queued") {
      enqueued += 1;
      options.log?.({ type: "enqueued" });
    } else {
      skipped += 1;
      options.log?.({ type: "skipped" });
    }
    await options.sleep(options.intervalMs);
  }

  return { enqueued, skipped };
}

/**
 * Every branch-head reconciliation shares one lock key.
 *
 * Two whole-tree passes at once would read the same commit and race each other
 * into the apply ledger. The ledger would keep it correct, but the second pass
 * is pure waste against a rate-limited Git API.
 */
export const CONTENT_HEAD_LOCK_KEY = "content:head";

export const SCHEDULED_RECONCILE_DEDUPE_KEY = "content:head:scheduled";

/** Webhooks dedupe separately, so a push is never folded into a stale tick. */
export const WEBHOOK_RECONCILE_DEDUPE_KEY = "content:head:webhook";
