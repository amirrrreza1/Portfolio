# Signed invalidation — live run

Date: **2026-08-16**  
Milestone: [M4](../M4.md) (delivery), [M3](../M3.md) (outbox drain)

## What was run

Two real processes over a real socket, with a real PostgreSQL underneath:

- **Web app** — `next dev` (Next.js 16.3.0), serving the actual
  `apps/web/src/app/api/invalidate/route.ts`, with `CACHE_INVALIDATION_SECRET`
  set. No stubs.
- **Publisher** — the actual `createInvalidationOutboxStore`,
  `runInvalidationDrain`, and `createSignedInvalidationSender`, driven over
  `http://localhost:3000`.
- **Database** — PGlite, which is PostgreSQL compiled to WebAssembly, holding
  the real `content_invalidation_outbox` DDL. The claim statement, the
  visibility timeout, and the state transitions are the shipped SQL.

The event payload was built by `articleCacheTags`, so the tags on the wire are
the ones the API will really emit.

## Result

Delivery, end to end:

```
1. queued outbox row with tags: [ 'public:article:hello-world:en', 'public:articles:en' ]
2. drain summary: { delivered: 1, retried: 0, failed: 0, unreadable: 0 }
3. outbox row after drain: { state: 'DELIVERED', attempts: 1, deliveredAt: 2026-08-16T18:20:04.714Z }
```

Rejections, against the live endpoint:

| Case                               | HTTP  |
| ---------------------------------- | ----- |
| Fresh signed event                 | `200` |
| Replayed nonce (first use)         | `200` |
| Replayed nonce (second use)        | `401` |
| Wrong secret                       | `401` |
| Timestamp 10 minutes in the past   | `401` |
| Timestamp 10 minutes in the future | `401` |
| Signed body that is not an event   | `401` |
| Forged signature                   | `401` |
| No signature headers               | `401` |

Retry and recovery, with the web app taken away and brought back:

```
1. web app unreachable  -> { delivered: 0, retried: 1 }  row: PENDING, attempts 1, backing off
2. second pass          -> { delivered: 0, retried: 0 }  row: untouched, still backing off
3. backoff elapsed      -> { delivered: 1, retried: 0 }  row: DELIVERED, attempts 2
```

## What the run found

**Half of every article invalidation was a no-op.** The publisher named
`public:articles:<locale>`; the listing client registered
`public:articles:list:<limit>:<cursor>:<locale>`, because listings are
paginated and each page is its own cache key. Publishing an article would have
purged its detail page and left every cached listing serving the old set until
its revalidate window lapsed.

Nothing caught it. The unit tests asserted the publisher's tags against a
hardcoded copy of themselves, which proves the function is stable and proves
nothing about whether anything listens on the other end.

Fixed by giving every listing read a collective tag alongside its own key, on
both cache layers, and by adding `apps/web/test/invalidation-tags.spec.ts` —
which asserts the publisher's tags against the tags the reader actually
registers, and would have failed on the original code.

## What this does not prove

This is a wire-and-logic proof, not the M4 exit gate. Still outstanding:

- No real article. The event was hand-built rather than produced by an M3
  reconciliation from a real content branch, so publish → commit → webhook →
  reconcile → invalidate has not run as one chain.
- No rendered route. The purge was observed as a `200` and an evicted cache
  entry, not as a page whose HTML changed.
- Prisma was not in the path. The drain talks to the `SqlExecutor` port, which
  PGlite satisfied directly; `createPrismaSqlExecutor` is unexercised here.
- Single process, single replica. Nonce storage is per-process by design, and
  nothing about multi-replica behaviour was tested.
