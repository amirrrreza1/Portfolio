import type {
  ClaimedContentJob,
  ContentJobStore,
  ContentQueueMetrics,
} from "@portfolio/database";
import { describe, expect, it, vi } from "vitest";

import {
  runContentScheduler,
  runContentWorker,
  runUnderExclusiveLock,
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
    kind: "PUBLISH_DUE",
    lockKey: "article:translation-1",
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
        PUBLISH_DUE: async (claimed) => {
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
        PUBLISH_DUE: async (claimed) => {
          if (claimed.id === "job-1") throw new Error("database timeout");
          handled.push(claimed.id);
        },
      },
      worker: "w1",
      leaseSeconds: 60,
      idleDelayMs: 0,
      sleep: async () => undefined,
      running: untilDrained(queue),
    });

    expect(recorded.failures[0]?.error).toBe("database timeout");
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
        PUBLISH_DUE: async () => {
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
  it("counts due publications returned by each scan", async () => {
    const scans = [2, 0];
    let ticks = 0;
    const summary = await runContentScheduler({
      enqueueDue: async () => scans.shift() ?? 0,
      intervalMs: 1_000,
      sleep: async () => undefined,
      running: () => ticks++ < 2,
    });
    expect(summary).toEqual({ enqueued: 2, skipped: 1 });
  });
});

describe("runUnderExclusiveLock", () => {
  it("does not run the work when another process holds the lock", async () => {
    // ADR-013's single-scheduler guarantee. Two replicas start; only the one
    // that takes the lock enqueues anything, and duplicate publication is
    // prevented by never running the second scanner rather than by
    // deduplicating its output afterwards.
    const work = vi.fn(async () => undefined);
    let running = true;
    const result = await runUnderExclusiveLock({
      withLock: async () => null,
      work,
      retryDelayMs: 1,
      sleep: async () => {
        running = false;
      },
      running: () => running,
    });

    expect(work).not.toHaveBeenCalled();
    expect(result).toEqual({ ranWork: false, waited: 1 });
  });

  it("waits and retries rather than queueing behind the holder", async () => {
    // Queueing is what turns one slow run into a backlog that publishes an
    // hour of scheduled articles in the same second, which is why the lock is
    // `pg_try_advisory_lock` and this loop sleeps between attempts.
    const work = vi.fn(async () => undefined);
    const delays: number[] = [];
    let attempts = 0;
    const result = await runUnderExclusiveLock({
      withLock: async (run) => {
        attempts += 1;
        if (attempts < 3) return null;
        await run();
        return undefined;
      },
      work,
      retryDelayMs: 30_000,
      sleep: async (ms) => {
        delays.push(ms);
      },
      running: () => true,
    });

    expect(work).toHaveBeenCalledTimes(1);
    expect(delays).toEqual([30_000, 30_000]);
    expect(result).toEqual({ ranWork: true, waited: 2 });
  });

  it("stops waiting when the process is asked to shut down", async () => {
    let running = true;
    const result = await runUnderExclusiveLock({
      withLock: async () => null,
      work: async () => undefined,
      retryDelayMs: 1,
      sleep: async () => {
        running = false;
      },
      running: () => running,
    });
    expect(result.ranWork).toBe(false);
  });
});
