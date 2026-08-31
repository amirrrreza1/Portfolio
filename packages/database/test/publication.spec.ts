import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createContentJobStore,
  type ContentJobStore,
  type SqlExecutor,
} from "../src/content-jobs.js";
import {
  enqueueDuePublications,
  publishDueTranslation,
} from "../src/articles.js";
import type { Database } from "../src/client.js";

/**
 * The scheduled-publication matrix required by M8's exit gate: exactly one
 * enqueue per due translation, exactly one publication however many times the
 * work is retried, and nothing left behind when the transaction fails.
 *
 * The queue half runs against real PostgreSQL under PGlite, because every
 * guarantee it makes — `ON CONFLICT` against a partial index, `FOR UPDATE SKIP
 * LOCKED`, the unique index over CLAIMED rows — is a database behaviour and a
 * mock would prove the mock.
 *
 * The publication half runs against an in-memory transactional double. That is
 * deliberate and its limits are stated rather than glossed: it proves that the
 * publish path opens exactly one transaction, performs every write inside it,
 * and refuses to act twice on the same row. It cannot prove that PostgreSQL
 * rolls a failed transaction back — no test with a fake database can — so the
 * live proof of that runs against a real server in
 * `apps/api/scripts/verify-blog-authoring.ts` §9.
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

const translationId = "t12345678901234567890123";
const bodyMarkdown =
  "## Scheduled\n\nA body that was rendered before it was due.";
const bodySha256 = createHash("sha256")
  .update(bodyMarkdown, "utf8")
  .digest("hex");

function scheduledRow(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    id: translationId,
    postId: "p12345678901234567890123",
    locale: "en",
    slug: "scheduled-article",
    status: "SCHEDULED",
    publishedAt: null,
    scheduledFor: new Date("2026-08-14T12:00:00.000Z"),
    bodyMarkdown,
    bodySha256,
    renderedHtml: "<h2>Scheduled</h2>",
    rendererVersion: "1",
    version: 3,
    ...overrides,
  };
}

interface Recorded {
  readonly revisions: unknown[];
  readonly outbox: unknown[];
  readonly audits: unknown[];
}

/**
 * A transactional double.
 *
 * `$transaction` snapshots the row and the side-effect tables before running
 * the callback and restores them if it throws, which is the behaviour the real
 * code depends on. Restoring here does not *prove* PostgreSQL does it; what it
 * proves is that the publish path performs no write outside the callback,
 * because any write that escaped the callback would survive the restore and
 * show up in the assertions.
 */
function transactionalDatabase(
  initial: Record<string, unknown>,
  hooks: { readonly onAudit?: () => void } = {}
): {
  database: Database;
  recorded: Recorded;
  read: () => Record<string, unknown>;
} {
  let row = { ...initial };
  let recorded: Recorded = { revisions: [], outbox: [], audits: [] };

  const client = {
    postTranslation: {
      findUnique: async () => ({ ...row }),
      findUniqueOrThrow: async () => ({ ...row }),
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        if (where.version !== row.version || where.status !== row.status) {
          return { count: 0 };
        }
        row = {
          ...row,
          ...data,
          version: (row.version as number) + 1,
        };
        return { count: 1 };
      },
    },
    contentRevision: {
      create: async ({ data }: { data: unknown }) => {
        recorded.revisions.push(data);
      },
    },
    contentInvalidationOutbox: {
      create: async ({ data }: { data: unknown }) => {
        recorded.outbox.push(data);
      },
    },
    auditEvent: {
      create: async ({ data }: { data: unknown }) => {
        hooks.onAudit?.();
        recorded.audits.push(data);
      },
    },
  };

  const database = {
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => {
      const rowBefore = { ...row };
      const recordedBefore: Recorded = {
        revisions: [...recorded.revisions],
        outbox: [...recorded.outbox],
        audits: [...recorded.audits],
      };
      try {
        return await run(client);
      } catch (error) {
        row = rowBefore;
        recorded = recordedBefore;
        throw error;
      }
    },
  } as unknown as Database;

  return {
    database,
    get recorded() {
      return recorded;
    },
    read: () => ({ ...row }),
  };
}

describe("scheduled publication enqueueing", () => {
  it("collapses repeated scheduler ticks into one pending job", async () => {
    // The scheduler is a poll, so the same due translation is seen on every
    // tick until it is published. Deduplication is what stops a slow worker
    // from accumulating one job per minute for the same article.
    const database = {
      postTranslation: {
        findMany: vi.fn().mockResolvedValue([{ id: translationId }]),
      },
    } as unknown as Database;

    await expect(enqueueDuePublications(database, jobs)).resolves.toBe(1);
    await expect(enqueueDuePublications(database, jobs)).resolves.toBe(0);
    await expect(enqueueDuePublications(database, jobs)).resolves.toBe(0);

    const rows = (
      await db.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM "content_jobs" WHERE "state" = 'PENDING'`
      )
    ).rows;
    expect(rows[0]?.count).toBe("1");
  });

  it("re-enqueues only once the previous job has actually been claimed", async () => {
    const database = {
      postTranslation: {
        findMany: vi.fn().mockResolvedValue([{ id: translationId }]),
      },
    } as unknown as Database;

    await enqueueDuePublications(database, jobs);
    const claimed = await jobs.claim({ worker: "worker-1", leaseSeconds: 60 });
    expect(claimed?.lockKey).toBe(`article:${translationId}`);

    // The dedupe index only covers PENDING rows, so a second job may exist
    // once the first is in flight — but the lock key stops the two from ever
    // running at the same time, and the publish guard stops the second from
    // having any effect.
    await expect(enqueueDuePublications(database, jobs)).resolves.toBe(1);
    await expect(
      jobs.claim({ worker: "worker-2", leaseSeconds: 60 })
    ).resolves.toBeNull();
  });
});

describe("publishDueTranslation", () => {
  it("publishes once and records one revision, one audit, and one invalidation", async () => {
    const fixture = transactionalDatabase(scheduledRow());
    const now = new Date("2026-08-14T12:30:00.000Z");

    await expect(
      publishDueTranslation(fixture.database, translationId, now)
    ).resolves.toBe("published");

    expect(fixture.read()).toMatchObject({
      status: "PUBLISHED",
      publishedAt: now,
      scheduledFor: null,
      version: 4,
    });
    expect(fixture.recorded.revisions).toHaveLength(1);
    expect(fixture.recorded.outbox).toHaveLength(1);
    expect(fixture.recorded.audits).toHaveLength(1);
  });

  it("is idempotent when a retried job runs the same publication again", async () => {
    // The case this exists for: the worker commits the publication and then
    // dies before settling the job. The lease lapses, the job is claimed
    // again, and the handler runs a second time on a row that is already
    // published. Nothing may happen the second time — not a second revision,
    // and above all not a second `publishedAt`.
    const fixture = transactionalDatabase(scheduledRow());
    const firstRun = new Date("2026-08-14T12:30:00.000Z");
    const retry = new Date("2026-08-14T12:45:00.000Z");

    await publishDueTranslation(fixture.database, translationId, firstRun);
    await expect(
      publishDueTranslation(fixture.database, translationId, retry)
    ).resolves.toBe("skipped");

    expect(fixture.read()).toMatchObject({
      publishedAt: firstRun,
      version: 4,
    });
    expect(fixture.recorded.revisions).toHaveLength(1);
    expect(fixture.recorded.outbox).toHaveLength(1);
  });

  it("performs every write inside the transaction it opened", async () => {
    // A write that escaped the transaction would survive the rollback below
    // and be visible here, which is exactly the failure this asserts against.
    const fixture = transactionalDatabase(scheduledRow(), {
      onAudit: () => {
        throw new Error("audit write failed");
      },
    });

    await expect(
      publishDueTranslation(
        fixture.database,
        translationId,
        new Date("2026-08-14T12:30:00.000Z")
      )
    ).rejects.toThrow("audit write failed");

    expect(fixture.read()).toMatchObject({
      status: "SCHEDULED",
      publishedAt: null,
      version: 3,
    });
    expect(fixture.recorded.revisions).toEqual([]);
    expect(fixture.recorded.outbox).toEqual([]);
  });

  it("refuses a body whose digest no longer matches, before publishing it", async () => {
    const fixture = transactionalDatabase(
      scheduledRow({ bodySha256: "f".repeat(64) })
    );

    await expect(
      publishDueTranslation(
        fixture.database,
        translationId,
        new Date("2026-08-14T12:30:00.000Z")
      )
    ).rejects.toThrow("integrity");

    expect(fixture.read()).toMatchObject({ status: "SCHEDULED" });
    expect(fixture.recorded.audits).toEqual([]);
  });

  it("leaves a translation alone until its scheduled time arrives", async () => {
    const fixture = transactionalDatabase(scheduledRow());

    await expect(
      publishDueTranslation(
        fixture.database,
        translationId,
        new Date("2026-08-14T11:59:59.000Z")
      )
    ).resolves.toBe("skipped");
    expect(fixture.read()).toMatchObject({ status: "SCHEDULED" });
  });
});
