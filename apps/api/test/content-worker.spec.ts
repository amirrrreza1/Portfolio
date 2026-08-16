import type {
  ClaimedContentJob,
  ContentJobStore,
  ContentQueueMetrics,
} from "@portfolio/database";
import { describe, expect, it } from "vitest";

import {
  CONTENT_HEAD_LOCK_KEY,
  runContentScheduler,
  runContentWorker,
  SCHEDULED_RECONCILE_DEDUPE_KEY,
} from "../src/worker/content-worker.js";

/**
 * The loop's settlement behaviour.
 *
 * The queue's own guarantees are proven against real PostgreSQL in
 * `@portfolio/database`. What is left to test here is what the worker does with
 * them: that every claimed job settles exactly once, that a throwing handler is
 * a recorded failure rather than a dead process, and that an unknown kind fails
 * loudly instead of being quietly acknowledged.
 */

interface Recorded {
  readonly settled: string[];
  readonly failures: { id: string; error: string; delaySeconds?: number }[];
  readonly enqueued: unknown[];
}

function fakeJobs(
  queue: ClaimedContentJob[],
  overrides: Partial<ContentJobStore> = {}
): { store: ContentJobStore; recorded: Recorded } {
  const recorded: Recorded = { settled: [], failures: [], enqueued: [] };
  const store: ContentJobStore = {
    enqueue: async (input) => {
      recorded.enqueued.push(input);
      return "queued";
    },
    claim: async () => queue.shift() ?? null,
    succeed: async (id) => {
      recorded.settled.push(`succeed:${id}`);
    },
    fail: async (input) => {
      recorded.settled.push(`fail:${input.id}`);
      recorded.failures.push({
        id: input.id,
        error: input.error,
        ...(input.delaySeconds === undefined
          ? {}
          : { delaySeconds: input.delaySeconds }),
      });
      return "retrying";
    },
    heartbeat: async () => true,
    reapExhaustedLeases: async () => 0,
    metrics: async (): Promise<ContentQueueMetrics> => ({
      pending: 0,
      claimed: 0,
      dead: 0,
      expiredLeases: 0,
      oldestPendingAgeSeconds: null,
    }),
    ...overrides,
  };
  return { store, recorded };
}

function job(overrides: Partial<ClaimedContentJob> = {}): ClaimedContentJob {
  return {
    id: "job-1",
    kind: "WEBHOOK_RECONCILE",
    lockKey: CONTENT_HEAD_LOCK_KEY,
    payload: {},
    attempts: 1,
    maxAttempts: 5,
    ...overrides,
  };
}

/** Ends the loop as soon as the queue drains, so a test cannot hang. */
function untilDrained(queue: readonly unknown[]): () => boolean {
  return () => queue.length > 0;
}

describe("runContentWorker", () => {
  it("runs a handler and marks the job succeeded", async () => {
    const queue = [job()];
    const { store, recorded } = fakeJobs(queue);
    const handled: string[] = [];

    const summary = await runContentWorker({
      jobs: store,
      handlers: {
        WEBHOOK_RECONCILE: async (claimed) => {
          handled.push(claimed.id);
        },
      },
      worker: "w1",
      leaseSeconds: 60,
      idleDelayMs: 0,
      sleep: async () => undefined,
      running: untilDrained(queue),
    });

    expect(handled).toEqual(["job-1"]);
    expect(recorded.settled).toEqual(["succeed:job-1"]);
    expect(summary.succeeded).toBe(1);
    expect(summary.failed).toBe(0);
  });

  it("records a throwing handler as a failure instead of dying", async () => {
    // A worker that crashes on one bad job stops doing all the other work, and
    // leaves that job CLAIMED until its lease lapses.
    const queue = [job(), job({ id: "job-2" })];
    const { store, recorded } = fakeJobs(queue);
    const handled: string[] = [];

    const summary = await runContentWorker({
      jobs: store,
      handlers: {
        WEBHOOK_RECONCILE: async (claimed) => {
          if (claimed.id === "job-1") throw new Error("GitHub returned 502");
          handled.push(claimed.id);
        },
      },
      worker: "w1",
      leaseSeconds: 60,
      idleDelayMs: 0,
      sleep: async () => undefined,
      running: untilDrained(queue),
    });

    expect(recorded.failures[0]?.error).toBe("GitHub returned 502");
    expect(handled).toEqual(["job-2"]);
    expect(summary.failed).toBe(1);
    expect(summary.succeeded).toBe(1);
  });

  it("backs off further on a later attempt", async () => {
    const queue = [job({ attempts: 3 })];
    const { store, recorded } = fakeJobs(queue);

    await runContentWorker({
      jobs: store,
      handlers: {
        WEBHOOK_RECONCILE: async () => {
          throw new Error("still failing");
        },
      },
      worker: "w1",
      leaseSeconds: 60,
      idleDelayMs: 0,
      sleep: async () => undefined,
      running: untilDrained(queue),
    });

    expect(recorded.failures[0]?.delaySeconds).toBe(60);
  });

  it("fails a job whose kind has no handler rather than acknowledging it", async () => {
    const queue = [job({ kind: "PUBLISH_DUE" })];
    const { store, recorded } = fakeJobs(queue);

    await runContentWorker({
      jobs: store,
      handlers: {},
      worker: "w1",
      leaseSeconds: 60,
      idleDelayMs: 0,
      sleep: async () => undefined,
      running: untilDrained(queue),
    });

    expect(recorded.settled).toEqual(["fail:job-1"]);
    expect(recorded.failures[0]?.error).toContain("PUBLISH_DUE");
  });

  it("sweeps lapsed claims before asking for work", async () => {
    const queue: ClaimedContentJob[] = [];
    const order: string[] = [];
    const { store } = fakeJobs(queue, {
      reapExhaustedLeases: async () => {
        order.push("reap");
        return 2;
      },
      claim: async () => {
        order.push("claim");
        return null;
      },
    });

    let ticks = 0;
    const summary = await runContentWorker({
      jobs: store,
      handlers: {},
      worker: "w1",
      leaseSeconds: 60,
      idleDelayMs: 0,
      sleep: async () => undefined,
      running: () => ticks++ < 1,
    });

    expect(order).toEqual(["reap", "claim"]);
    expect(summary.reaped).toBe(2);
  });

  it("waits instead of spinning when the queue is empty", async () => {
    const sleeps: number[] = [];
    const { store } = fakeJobs([]);

    let ticks = 0;
    await runContentWorker({
      jobs: store,
      handlers: {},
      worker: "w1",
      leaseSeconds: 60,
      idleDelayMs: 2_000,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      running: () => ticks++ < 3,
    });

    expect(sleeps).toEqual([2_000, 2_000, 2_000]);
  });
});

describe("runContentScheduler", () => {
  it("enqueues a deduplicated reconciliation each tick", async () => {
    const { store, recorded } = fakeJobs([]);

    let ticks = 0;
    await runContentScheduler({
      jobs: store,
      intervalMs: 1_000,
      sleep: async () => undefined,
      running: () => ticks++ < 2,
    });

    expect(recorded.enqueued).toHaveLength(2);
    expect(recorded.enqueued[0]).toMatchObject({
      kind: "SCHEDULED_RECONCILE",
      lockKey: CONTENT_HEAD_LOCK_KEY,
      dedupeKey: SCHEDULED_RECONCILE_DEDUPE_KEY,
    });
  });

  it("counts a folded duplicate as skipped rather than as work", async () => {
    const { store } = fakeJobs([], { enqueue: async () => "deduplicated" });

    let ticks = 0;
    const summary = await runContentScheduler({
      jobs: store,
      intervalMs: 1_000,
      sleep: async () => undefined,
      running: () => ticks++ < 2,
    });

    expect(summary).toEqual({ enqueued: 0, skipped: 2 });
  });
});
