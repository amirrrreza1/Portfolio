import { describe, expect, it, vi } from "vitest";

import {
  advisoryLockKey,
  ADVISORY_LOCKS,
  withAdvisoryLock,
  type AdvisoryLockPool,
} from "../src/concurrency.js";

/**
 * The lock that makes "exactly one scheduler" true.
 *
 * ADR-013 puts publication behind a PostgreSQL advisory lock rather than
 * behind a configuration flag, because a flag is only as correct as the last
 * deployment. What is asserted here is the part that is pure: that every
 * replica derives the same 64-bit key from the same name, that a replica which
 * cannot take the lock does not run the work, and that the lock is released
 * even when the work throws. Exclusion between two real sessions is a server
 * behaviour and is proven against a running PostgreSQL in the M8 blog
 * verification script.
 */

function fakeDatabase(responses: readonly boolean[]): {
  db: AdvisoryLockPool;
  statements: string[];
  release: ReturnType<typeof vi.fn>;
} {
  const statements: string[] = [];
  let attempt = 0;
  const release = vi.fn();
  const session = {
    release,
    query: vi.fn(async (query: string) => {
      statements.push(query);
      if (!query.includes("pg_try_advisory_lock")) {
        return { rows: [{ unlocked: true }] };
      }
      const locked = responses[attempt] ?? true;
      attempt += 1;
      return { rows: [{ locked }] };
    }),
  };
  const db: AdvisoryLockPool = { connect: vi.fn(async () => session) };
  return { db, statements, release };
}

describe("advisoryLockKey", () => {
  it("derives the same key from the same name in every process", () => {
    // Two replicas that hashed the name differently would each believe they
    // held "the" lock, which is the exact failure the lock exists to prevent.
    expect(advisoryLockKey("portfolio:scheduler")).toBe(
      advisoryLockKey("portfolio:scheduler")
    );
    expect(advisoryLockKey("portfolio:scheduler")).not.toBe(
      advisoryLockKey("portfolio:publication")
    );
  });

  it("stays inside the signed 64-bit range PostgreSQL accepts", () => {
    for (const name of [
      "portfolio:scheduler",
      "portfolio:publication",
      "a",
      "ژ".repeat(64),
    ]) {
      const key = advisoryLockKey(name);
      expect(key >= 0n).toBe(true);
      expect(key <= 0x7fffffffffffffffn).toBe(true);
    }
  });

  it("names the two locks the worker topology actually uses", () => {
    expect(ADVISORY_LOCKS.scheduler).toBe(
      advisoryLockKey("portfolio:scheduler")
    );
    expect(ADVISORY_LOCKS.publication).toBe(
      advisoryLockKey("portfolio:publication")
    );
  });
});

describe("withAdvisoryLock", () => {
  it("runs the work and releases the lock", async () => {
    const { db, statements, release } = fakeDatabase([true]);
    const work = vi.fn(async () => {
      expect(release).not.toHaveBeenCalled();
      return "done";
    });

    await expect(
      withAdvisoryLock(db, ADVISORY_LOCKS.scheduler, work)
    ).resolves.toBe("done");
    expect(work).toHaveBeenCalledTimes(1);
    expect(db.connect).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledExactlyOnceWith(false);
    expect(statements.some((sql) => sql.includes("pg_advisory_unlock"))).toBe(
      true
    );
  });

  it("returns null without running the work when the lock is held elsewhere", async () => {
    const { db, statements } = fakeDatabase([false]);
    const work = vi.fn(async () => "done");

    await expect(
      withAdvisoryLock(db, ADVISORY_LOCKS.scheduler, work)
    ).resolves.toBeNull();
    expect(work).not.toHaveBeenCalled();
    // Nothing was taken, so no unlock may be attempted on this session.
    expect(statements.some((sql) => sql.includes("pg_advisory_unlock"))).toBe(
      false
    );
  });

  it("destroys a session when releasing its lock fails", async () => {
    const release = vi.fn();
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ locked: true }] })
      .mockRejectedValueOnce(new Error("connection lost"));
    const pool = { connect: async () => ({ query, release }) };
    await expect(
      withAdvisoryLock(pool, ADVISORY_LOCKS.scheduler, async () => "done")
    ).rejects.toThrow("connection lost");
    expect(release).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("releases the lock when the work throws", async () => {
    // A session-scoped lock that leaks on failure stops every later scheduler
    // tick until the connection is recycled, which looks exactly like a
    // scheduler that has silently stopped.
    const { db, statements } = fakeDatabase([true]);

    await expect(
      withAdvisoryLock(db, ADVISORY_LOCKS.publication, async () => {
        throw new Error("publication failed");
      })
    ).rejects.toThrow("publication failed");
    expect(
      statements.filter((sql) => sql.includes("pg_advisory_unlock"))
    ).toHaveLength(1);
  });
});
