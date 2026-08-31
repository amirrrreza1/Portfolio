import {
  retryDelaySeconds,
  type ClaimedContentJob,
  type ContentJobKind,
  type ContentJobStore,
} from "@portfolio/database";

/**
 * The publication worker loop, with every dependency injected.
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
  readonly enqueueDue: () => Promise<number>;
  readonly intervalMs: number;
  readonly sleep: (ms: number) => Promise<void>;
  readonly running: () => boolean;
  readonly log?: (event: {
    readonly type: "enqueued" | "skipped";
    readonly count: number;
  }) => void;
}

/**
 * Periodically scans PostgreSQL for due scheduled translations and enqueues
 * idempotent per-translation publication work.
 */
export async function runContentScheduler(
  options: SchedulerOptions
): Promise<{ readonly enqueued: number; readonly skipped: number }> {
  let enqueued = 0;
  let skipped = 0;

  while (options.running()) {
    const count = await options.enqueueDue();
    if (count > 0) {
      enqueued += count;
      options.log?.({ type: "enqueued", count });
    } else {
      skipped += 1;
      options.log?.({ type: "skipped", count: 0 });
    }
    await options.sleep(options.intervalMs);
  }

  return { enqueued, skipped };
}

export interface ExclusiveLockOptions {
  /**
   * Runs `work` while holding the lock, or resolves `null` without running it
   * because someone else holds it. Injected rather than taken as a database
   * handle so the topology rule can be asserted without a server.
   */
  readonly withLock: (work: () => Promise<void>) => Promise<void | null>;
  readonly work: () => Promise<void>;
  /** How long to wait before asking for a lock that was held elsewhere. */
  readonly retryDelayMs: number;
  readonly sleep: (ms: number) => Promise<void>;
  readonly running: () => boolean;
  readonly log?: (event: { readonly type: "held-elsewhere" }) => void;
}

/**
 * Runs one job under a lock that only one process may hold.
 *
 * This is the shape of ADR-013's single-scheduler guarantee: a replica that
 * cannot take the lock **does not run the work**, it waits and asks again. The
 * distinction matters because the obvious alternative — queueing behind the
 * lock — is what turns one slow run into a backlog that publishes an hour of
 * scheduled articles in the same second.
 *
 * It returns as soon as the work completes, so a caller that wants the loop to
 * continue puts the loop inside `work`, not around this.
 */
export async function runUnderExclusiveLock(
  options: ExclusiveLockOptions
): Promise<{ readonly ranWork: boolean; readonly waited: number }> {
  let waited = 0;
  while (options.running()) {
    const held = await options.withLock(options.work);
    if (held !== null) return { ranWork: true, waited };
    waited += 1;
    options.log?.({ type: "held-elsewhere" });
    await options.sleep(options.retryDelayMs);
  }
  return { ranWork: false, waited };
}
