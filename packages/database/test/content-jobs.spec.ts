import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createContentJobStore,
  retryDelaySeconds,
  type ContentJobStore,
  type SqlExecutor,
} from "../src/content-jobs.js";

/**
 * The queue's exclusion rules, proven against real PostgreSQL.
 *
 * A job queue is exactly the kind of component where a mocked test proves
 * nothing: every guarantee it makes — `FOR UPDATE SKIP LOCKED`, `ON CONFLICT`
 * against a partial index, a unique index that only applies to CLAIMED rows —
 * is a database behaviour. PGlite is PostgreSQL compiled to WebAssembly, so
 * these run the real statements against the real planner with no server.
 *
 * The schema comes from `prisma migrate diff` for the same reason
 * `constraints.spec.ts` does it: a hand-copied DDL drifts and then tests a
 * shape that no longer exists.
 */

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

let db: PGlite;
let jobs: ContentJobStore;

const executor: SqlExecutor = {
  query: async (sql, params = []) =>
    (await db.query(sql, [...params])).rows as readonly never[],
};

beforeAll(async () => {
  const ddl = execFileSync(
    "node",
    [
      path.join(packageRoot, "node_modules/prisma/build/index.js"),
      "migrate",
      "diff",
      "--from-empty",
      "--to-schema",
      path.join(packageRoot, "prisma/schema.prisma"),
      "--script",
    ],
    { encoding: "utf8", cwd: packageRoot }
  );

  db = new PGlite();
  await db.exec(ddl);

  const constraints = readFileSync(
    path.join(packageRoot, "prisma/sql/integrity_constraints.sql"),
    "utf8"
  )
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  for (const statement of constraints
    .split(";")
    .map((value) => value.trim())
    .filter(Boolean)) {
    await db.exec(`${statement};`);
  }

  jobs = createContentJobStore(executor);
});

beforeEach(async () => {
  await db.exec(`DELETE FROM "content_jobs";`);
});

async function stateOf(id: string): Promise<string> {
  const rows = (
    await db.query<{ state: string }>(
      `SELECT "state" FROM "content_jobs" WHERE "id" = $1`,
      [id]
    )
  ).rows;
  return rows[0]!.state;
}

async function idOfOnlyJob(): Promise<string> {
  const rows = (
    await db.query<{ id: string }>(`SELECT "id" FROM "content_jobs"`)
  ).rows;
  expect(rows).toHaveLength(1);
  return rows[0]!.id;
}

describe("enqueue", () => {
  it("queues work and hands back a claimable job", async () => {
    expect(
      await jobs.enqueue({
        kind: "PUBLISH_DUE",
        lockKey: "content-head",
        payload: { reason: "push" },
      })
    ).toBe("queued");

    const claimed = await jobs.claim({ worker: "w1", leaseSeconds: 60 });

    expect(claimed?.kind).toBe("PUBLISH_DUE");
    expect(claimed?.payload).toEqual({ reason: "push" });
    expect(claimed?.attempts).toBe(1);
  });

  it("collapses a burst into a single pending job", async () => {
    const enqueue = () =>
      jobs.enqueue({
        kind: "PUBLISH_DUE",
        lockKey: "content-head",
        dedupeKey: "reconcile:content-head",
      });

    expect(await enqueue()).toBe("queued");
    expect(await enqueue()).toBe("deduplicated");
    expect(await enqueue()).toBe("deduplicated");

    const rows = (await db.query(`SELECT "id" FROM "content_jobs"`)).rows;
    expect(rows).toHaveLength(1);
  });

  it("stops deduplicating once the pending job has been claimed", async () => {
    // Otherwise a push arriving while a reconciliation is mid-flight would be
    // swallowed, and the tree it changed would never be re-read.
    await jobs.enqueue({
      kind: "PUBLISH_DUE",
      lockKey: "content-head",
      dedupeKey: "reconcile:content-head",
    });
    await jobs.claim({ worker: "w1", leaseSeconds: 60 });

    expect(
      await jobs.enqueue({
        kind: "PUBLISH_DUE",
        lockKey: "content-head",
        dedupeKey: "reconcile:content-head",
      })
    ).toBe("queued");
  });

  it("does not deduplicate jobs that opt out", async () => {
    await jobs.enqueue({ kind: "PUBLISH_DUE", lockKey: "post:a:en" });
    await jobs.enqueue({ kind: "PUBLISH_DUE", lockKey: "post:a:en" });

    const rows = (await db.query(`SELECT "id" FROM "content_jobs"`)).rows;
    expect(rows).toHaveLength(2);
  });

  it("respects a future availability time", async () => {
    await jobs.enqueue({
      kind: "PUBLISH_DUE",
      lockKey: "post:a:en",
      availableAt: new Date(Date.now() + 60_000),
    });

    expect(await jobs.claim({ worker: "w1", leaseSeconds: 60 })).toBeNull();
  });
});

describe("claim", () => {
  it("returns null on an empty queue", async () => {
    expect(await jobs.claim({ worker: "w1", leaseSeconds: 60 })).toBeNull();
  });

  it("never gives two workers the same job", async () => {
    await jobs.enqueue({
      kind: "PUBLISH_DUE",
      lockKey: "content-head",
    });

    const first = await jobs.claim({ worker: "w1", leaseSeconds: 60 });
    const second = await jobs.claim({ worker: "w2", leaseSeconds: 60 });

    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it("serializes jobs that share a lock key", async () => {
    // Ordering matters within a translation: an earlier apply must not be
    // overtaken by a later one.
    await jobs.enqueue({ kind: "PUBLISH_DUE", lockKey: "post:a:en" });
    await jobs.enqueue({ kind: "PUBLISH_DUE", lockKey: "post:a:en" });

    expect(await jobs.claim({ worker: "w1", leaseSeconds: 60 })).not.toBeNull();
    expect(await jobs.claim({ worker: "w2", leaseSeconds: 60 })).toBeNull();
  });

  it("runs different lock keys concurrently", async () => {
    await jobs.enqueue({ kind: "PUBLISH_DUE", lockKey: "post:a:en" });
    await jobs.enqueue({ kind: "PUBLISH_DUE", lockKey: "post:b:fa" });

    const first = await jobs.claim({ worker: "w1", leaseSeconds: 60 });
    const second = await jobs.claim({ worker: "w2", leaseSeconds: 60 });

    expect(first?.lockKey).toBe("post:a:en");
    expect(second?.lockKey).toBe("post:b:fa");
  });

  it("takes the oldest due job first", async () => {
    await jobs.enqueue({ kind: "PUBLISH_DUE", lockKey: "post:new:en" });
    await db.exec(
      `UPDATE "content_jobs" SET "availableAt" = now() - interval '1 hour';`
    );
    await jobs.enqueue({ kind: "PUBLISH_DUE", lockKey: "post:newer:en" });

    expect(
      (await jobs.claim({ worker: "w1", leaseSeconds: 60 }))?.lockKey
    ).toBe("post:new:en");
  });

  it("recovers a job whose worker died, counting the lost attempt", async () => {
    await jobs.enqueue({ kind: "PUBLISH_DUE", lockKey: "content-head" });
    await jobs.claim({ worker: "dead-worker", leaseSeconds: 60 });
    await db.exec(
      `UPDATE "content_jobs" SET "leaseExpiresAt" = now() - interval '1 second';`
    );

    const reclaimed = await jobs.claim({ worker: "w2", leaseSeconds: 60 });

    expect(reclaimed).not.toBeNull();
    expect(reclaimed?.attempts).toBe(2);
  });
});

describe("completion", () => {
  it("marks success and releases the lock key", async () => {
    await jobs.enqueue({ kind: "PUBLISH_DUE", lockKey: "post:a:en" });
    await jobs.enqueue({ kind: "PUBLISH_DUE", lockKey: "post:a:en" });
    const first = await jobs.claim({ worker: "w1", leaseSeconds: 60 });

    await jobs.succeed(first!.id);

    expect(await stateOf(first!.id)).toBe("SUCCEEDED");
    expect(await jobs.claim({ worker: "w1", leaseSeconds: 60 })).not.toBeNull();
  });

  it("retries with backoff before the budget is spent", async () => {
    await jobs.enqueue({ kind: "PUBLISH_DUE", lockKey: "content-head" });
    const claimed = await jobs.claim({ worker: "w1", leaseSeconds: 60 });

    expect(
      await jobs.fail({
        id: claimed!.id,
        error: "GitHub returned 502",
        delaySeconds: 30,
      })
    ).toBe("retrying");
    expect(await stateOf(claimed!.id)).toBe("PENDING");
    // Still backing off, so it is not claimable yet.
    expect(await jobs.claim({ worker: "w1", leaseSeconds: 60 })).toBeNull();
  });

  it("dead-letters once attempts are exhausted", async () => {
    await jobs.enqueue({
      kind: "PUBLISH_DUE",
      lockKey: "content-head",
      maxAttempts: 2,
    });
    const id = await idOfOnlyJob();

    const first = await jobs.claim({ worker: "w1", leaseSeconds: 60 });
    expect(
      await jobs.fail({ id: first!.id, error: "boom", delaySeconds: 0 })
    ).toBe("retrying");
    const second = await jobs.claim({ worker: "w1", leaseSeconds: 60 });
    expect(
      await jobs.fail({ id: second!.id, error: "boom", delaySeconds: 0 })
    ).toBe("dead");

    expect(await stateOf(id)).toBe("DEAD");
    expect(await jobs.claim({ worker: "w1", leaseSeconds: 60 })).toBeNull();
  });

  it("keeps a dead job rather than deleting the evidence", async () => {
    await jobs.enqueue({
      kind: "PUBLISH_DUE",
      lockKey: "content-head",
      maxAttempts: 1,
    });
    const claimed = await jobs.claim({ worker: "w1", leaseSeconds: 60 });
    await jobs.fail({ id: claimed!.id, error: "permanent", delaySeconds: 0 });

    const rows = (
      await db.query<{ lastError: string; finishedAt: Date | null }>(
        `SELECT "lastError", "finishedAt" FROM "content_jobs" WHERE "id" = $1`,
        [claimed!.id]
      )
    ).rows;
    expect(rows[0]?.lastError).toBe("permanent");
    expect(rows[0]?.finishedAt).not.toBeNull();
  });

  it("truncates a runaway error rather than storing it whole", async () => {
    await jobs.enqueue({ kind: "PUBLISH_DUE", lockKey: "content-head" });
    const claimed = await jobs.claim({ worker: "w1", leaseSeconds: 60 });

    await jobs.fail({
      id: claimed!.id,
      error: "x".repeat(5_000),
      delaySeconds: 0,
    });

    const rows = (
      await db.query<{ lastError: string }>(
        `SELECT "lastError" FROM "content_jobs" WHERE "id" = $1`,
        [claimed!.id]
      )
    ).rows;
    expect(rows[0]?.lastError).toHaveLength(1_000);
  });
});

describe("heartbeat", () => {
  it("extends a live claim", async () => {
    await jobs.enqueue({
      kind: "PUBLISH_DUE",
      lockKey: "content-head",
    });
    const claimed = await jobs.claim({ worker: "w1", leaseSeconds: 1 });

    expect(
      await jobs.heartbeat({ id: claimed!.id, worker: "w1", leaseSeconds: 600 })
    ).toBe(true);
    await db.exec(`UPDATE "content_jobs" SET "availableAt" = now();`);
    expect(await jobs.claim({ worker: "w2", leaseSeconds: 60 })).toBeNull();
  });

  it("refuses to extend a claim another worker now holds", async () => {
    await jobs.enqueue({
      kind: "PUBLISH_DUE",
      lockKey: "content-head",
    });
    const claimed = await jobs.claim({ worker: "w1", leaseSeconds: 60 });

    expect(
      await jobs.heartbeat({ id: claimed!.id, worker: "w2", leaseSeconds: 600 })
    ).toBe(false);
  });
});

describe("reapExhaustedLeases", () => {
  it("dead-letters a lapsed claim that has no attempts left", async () => {
    // Unreachable by claim(), which requires attempts < maxAttempts, so
    // without the sweep it stays CLAIMED forever and never reports as failed.
    await jobs.enqueue({
      kind: "PUBLISH_DUE",
      lockKey: "content-head",
      maxAttempts: 1,
    });
    const claimed = await jobs.claim({ worker: "w1", leaseSeconds: 60 });
    await db.exec(
      `UPDATE "content_jobs" SET "leaseExpiresAt" = now() - interval '1 second';`
    );

    expect(await jobs.reapExhaustedLeases()).toBe(1);
    expect(await stateOf(claimed!.id)).toBe("DEAD");
  });

  it("leaves a lapsed claim that still has attempts for claim() to recover", async () => {
    await jobs.enqueue({
      kind: "PUBLISH_DUE",
      lockKey: "content-head",
      maxAttempts: 3,
    });
    const claimed = await jobs.claim({ worker: "w1", leaseSeconds: 60 });
    await db.exec(
      `UPDATE "content_jobs" SET "leaseExpiresAt" = now() - interval '1 second';`
    );

    expect(await jobs.reapExhaustedLeases()).toBe(0);
    expect(await stateOf(claimed!.id)).toBe("CLAIMED");
  });
});

describe("metrics", () => {
  it("reports an empty queue as current rather than as zero age", async () => {
    const metrics = await jobs.metrics();

    expect(metrics.pending).toBe(0);
    expect(metrics.oldestPendingAgeSeconds).toBeNull();
  });

  it("counts each state and ages the oldest due job", async () => {
    await jobs.enqueue({ kind: "PUBLISH_DUE", lockKey: "post:a:en" });
    await db.exec(
      `UPDATE "content_jobs" SET "availableAt" = now() - interval '90 seconds';`
    );
    await jobs.enqueue({ kind: "PUBLISH_DUE", lockKey: "post:b:en" });
    await jobs.claim({ worker: "w1", leaseSeconds: 60 });

    const metrics = await jobs.metrics();

    expect(metrics.claimed).toBe(1);
    expect(metrics.pending).toBe(1);
    expect(metrics.oldestPendingAgeSeconds).toBeGreaterThanOrEqual(0);
  });

  it("surfaces expired leases as their own signal", async () => {
    await jobs.enqueue({ kind: "PUBLISH_DUE", lockKey: "post:a:en" });
    await jobs.claim({ worker: "w1", leaseSeconds: 60 });
    await db.exec(
      `UPDATE "content_jobs" SET "leaseExpiresAt" = now() - interval '1 second';`
    );

    expect((await jobs.metrics()).expiredLeases).toBe(1);
  });
});

describe("retryDelaySeconds", () => {
  it("doubles per attempt", () => {
    expect(retryDelaySeconds(1)).toBe(15);
    expect(retryDelaySeconds(2)).toBe(30);
    expect(retryDelaySeconds(3)).toBe(60);
    expect(retryDelaySeconds(4)).toBe(120);
  });

  it("caps rather than growing without bound", () => {
    expect(retryDelaySeconds(50)).toBe(3_600);
  });
});
