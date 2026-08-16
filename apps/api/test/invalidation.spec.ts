import { createHash, createHmac } from "node:crypto";

import {
  articleCacheTags,
  INVALIDATION_HEADERS,
  invalidationSigningString,
  publicCacheTag,
  type InvalidationEvent,
} from "@portfolio/contracts/content";
import type {
  ClaimedInvalidation,
  InvalidationOutboxStore,
} from "@portfolio/database";
import { describe, expect, it } from "vitest";

import { runInvalidationDrain } from "../src/worker/invalidation-drain.js";
import { createSignedInvalidationSender } from "../src/worker/invalidation-sender.js";

const SECRET = "invalidation-secret";

const EVENT: InvalidationEvent = {
  eventId: "event-1",
  locale: "en",
  reason: "publish",
  tags: ["public:article:hello:en", "public:articles:en"],
  issuedAt: "2026-08-16T12:00:00.000Z",
};

describe("cache tags", () => {
  it("names a tag identically for both sides", () => {
    expect(publicCacheTag("articles", "en")).toBe("public:articles:en");
  });

  it("keeps one locale's publication out of the other's tags", () => {
    // API_SPEC.md §8: publishing English must not purge Persian.
    const english = articleCacheTags({ locale: "en", slug: "hello" });
    const persian = articleCacheTags({ locale: "fa", slug: "hello" });

    expect(english.some((tag) => persian.includes(tag))).toBe(false);
  });

  it("purges the article and its listing, and nothing else", () => {
    // Purging the whole locale would throw away the portfolio, appearance and
    // home caches for a change that cannot affect them.
    expect(articleCacheTags({ locale: "en", slug: "hello" })).toEqual([
      "public:article:hello:en",
      "public:articles:en",
    ]);
  });
});

describe("createSignedInvalidationSender", () => {
  function capture() {
    const calls: { url: string; init: RequestInit }[] = [];
    const sender = createSignedInvalidationSender({
      endpoint: "https://web.example/api/invalidate",
      secret: SECRET,
      now: () => new Date("2026-08-16T12:00:00.000Z"),
      nonce: () => "nonce-1",
      fetch: (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response("{}", { status: 200 });
      }) as unknown as typeof fetch,
    });
    return { sender, calls };
  }

  it("signs the exact bytes it sends", async () => {
    const { sender, calls } = capture();

    await sender.send(EVENT);

    const sent = calls[0]!;
    const body = sent.init.body as string;
    const headers = sent.init.headers as Record<string, string>;
    const expected = createHmac("sha256", SECRET)
      .update(
        invalidationSigningString({
          timestamp: headers[INVALIDATION_HEADERS.timestamp]!,
          nonce: headers[INVALIDATION_HEADERS.nonce]!,
          bodySha256: createHash("sha256").update(body, "utf8").digest("hex"),
        }),
        "utf8"
      )
      .digest("hex");

    expect(headers[INVALIDATION_HEADERS.signature]).toBe(expected);
  });

  it("sends a fresh nonce and a current timestamp", async () => {
    const { sender, calls } = capture();

    await sender.send(EVENT);

    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers[INVALIDATION_HEADERS.nonce]).toBe("nonce-1");
    expect(headers[INVALIDATION_HEADERS.timestamp]).toBe(
      Math.floor(Date.parse("2026-08-16T12:00:00.000Z") / 1000).toString()
    );
  });

  it("reports a rejected delivery rather than throwing", async () => {
    const sender = createSignedInvalidationSender({
      endpoint: "https://web.example/api/invalidate",
      secret: SECRET,
      fetch: (async () =>
        new Response("nope", { status: 401 })) as unknown as typeof fetch,
    });

    expect(await sender.send(EVENT)).toMatchObject({ ok: false, status: 401 });
  });

  it("treats a network failure the same as a refusal", async () => {
    const sender = createSignedInvalidationSender({
      endpoint: "https://web.example/api/invalidate",
      secret: SECRET,
      fetch: (async () => {
        throw new Error("ECONNREFUSED");
      }) as unknown as typeof fetch,
    });

    const result = await sender.send(EVENT);

    expect(result.ok).toBe(false);
    expect(result.status).toBeNull();
  });

  it("refuses to construct without a secret", () => {
    expect(() =>
      createSignedInvalidationSender({
        endpoint: "https://web.example/api/invalidate",
        secret: "  ",
      })
    ).toThrow(/CACHE_INVALIDATION_SECRET/);
  });
});

describe("runInvalidationDrain", () => {
  function outbox(rows: ClaimedInvalidation[]) {
    const settled: string[] = [];
    const store: InvalidationOutboxStore = {
      claim: async () => rows.splice(0, rows.length),
      markDelivered: async (id) => {
        settled.push(`delivered:${id}`);
      },
      reschedule: async (input) => {
        settled.push(`reschedule:${input.id}:${input.maxAttempts}`);
        return input.maxAttempts <= input.id.length ? "failed" : "retrying";
      },
      metrics: async () => ({
        pending: 0,
        failed: 0,
        oldestPendingAgeSeconds: null,
      }),
    };
    return { store, settled, rows };
  }

  const drainOptions = {
    maxAttempts: 8,
    visibilitySeconds: 120,
    batchSize: 20,
    idleDelayMs: 0,
    sleep: async () => undefined,
  };

  it("marks a delivered event and stops retrying it", async () => {
    const rows = [
      { id: "row-1", cacheTag: EVENT.tags[0]!, payload: EVENT, attempts: 1 },
    ];
    const target = outbox(rows);

    const summary = await runInvalidationDrain({
      ...drainOptions,
      outbox: target.store,
      sender: { send: async () => ({ ok: true, status: 200 }) },
      running: () => rows.length > 0,
    });

    expect(target.settled).toEqual(["delivered:row-1"]);
    expect(summary.delivered).toBe(1);
  });

  it("reschedules a refused delivery with backoff", async () => {
    const rows = [
      { id: "row-1", cacheTag: EVENT.tags[0]!, payload: EVENT, attempts: 2 },
    ];
    const target = outbox(rows);

    const summary = await runInvalidationDrain({
      ...drainOptions,
      outbox: target.store,
      sender: {
        send: async () => ({ ok: false, status: 500, detail: "HTTP 500" }),
      },
      running: () => rows.length > 0,
    });

    expect(target.settled).toEqual(["reschedule:row-1:8"]);
    expect(summary.retried).toBe(1);
  });

  it("exhausts an unparseable row immediately instead of retrying it", async () => {
    // A payload that is not an event will never become deliverable, so burning
    // eight attempts on it is noise that hides real failures.
    const rows = [
      { id: "row-1", cacheTag: "x", payload: { nonsense: true }, attempts: 1 },
    ];
    const target = outbox(rows);
    let sends = 0;

    const summary = await runInvalidationDrain({
      ...drainOptions,
      outbox: target.store,
      sender: {
        send: async () => {
          sends += 1;
          return { ok: true, status: 200 };
        },
      },
      running: () => rows.length > 0,
    });

    expect(sends).toBe(0);
    expect(target.settled).toEqual(["reschedule:row-1:0"]);
    expect(summary.unreadable).toBe(1);
  });

  it("keeps draining the batch after one event fails", async () => {
    const rows = [
      { id: "row-1", cacheTag: "a", payload: EVENT, attempts: 1 },
      { id: "row-2", cacheTag: "b", payload: EVENT, attempts: 1 },
    ];
    const target = outbox(rows);
    let call = 0;

    const summary = await runInvalidationDrain({
      ...drainOptions,
      outbox: target.store,
      sender: {
        send: async () => {
          call += 1;
          return call === 1
            ? { ok: false, status: 500, detail: "HTTP 500" }
            : { ok: true, status: 200 };
        },
      },
      running: () => rows.length > 0,
    });

    expect(summary.delivered).toBe(1);
    expect(summary.retried).toBe(1);
  });

  it("waits instead of spinning when nothing is queued", async () => {
    const sleeps: number[] = [];
    const target = outbox([]);
    let ticks = 0;

    await runInvalidationDrain({
      ...drainOptions,
      idleDelayMs: 1_000,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      outbox: target.store,
      sender: { send: async () => ({ ok: true, status: 200 }) },
      running: () => ticks++ < 2,
    });

    expect(sleeps).toEqual([1_000, 1_000]);
  });
});
