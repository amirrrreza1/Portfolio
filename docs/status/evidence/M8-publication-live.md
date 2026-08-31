# M8 — scheduled publication and pinned-session leadership

Run date: **2026-08-31**

Result: **63/63 live API checks passing**, including all six section-10 checks

Environment and the other checks are recorded in
[M8-discovery-live.md](M8-discovery-live.md). This run used a real PostgreSQL
17.11 server with the checked-in migrations, not a mocked database.

## What was proven

| Check                            | Observed result                                                                                                                        |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Repeated scheduler ticks         | First tick enqueues the due translation; the next enqueues zero duplicate jobs.                                                        |
| Publication retried after commit | `published`, then `skipped`; exactly one revision/outbox row, with unchanged `publishedAt`.                                            |
| Invalid source digest            | Refused before mutation; translation remains scheduled, without a new revision/outbox.                                                 |
| Failure after writes             | Failure injected at the final audit insert, after the real row update, revision, and outbox inserts; PostgreSQL rolls everything back. |
| Competing scheduler sessions     | Only one callback runs; the other returns `null`, while the holder's connection remains checked out.                                   |
| Release without process exit     | The contender acquires the same lock after the first callback finishes.                                                                |

The late-write rollback asserts unchanged version and schedule, null publication
time, and unchanged revision, outbox, and audit counts. It uses a Prisma query
extension solely to fail the final audit operation; all preceding writes are
performed in the real PostgreSQL transaction. The former digest-only check
proved a pre-write refusal, not rollback, and is retained as a separate check.

## Lock ownership correction

The previous helper acquired and released a **session-level** advisory lock
through independent pooled Prisma queries. A pool can hand those queries
different connections, or retire an idle connection while its worker is still
running. The earlier short two-client proof did not establish session ownership
throughout the worker's lifetime.

`withAdvisoryLock` now checks out one dedicated `pg` connection, acquires the
lock, keeps that connection checked out throughout the callback, and releases
the lock on that exact connection. No long-running SQL transaction is needed.
An uncertain unlock destroys the connection instead of returning a possibly
locked session to the pool. Both scheduler and publication worker entrypoints
use the dedicated pool and close it during cleanup.

The live test waits for an acquisition signal instead of sleeping for 250 ms,
asserts the lock pool has one connection and zero idle connections while work
is active, and proves that a separate connection cannot acquire the lock. Unit
tests additionally assert one checkout, no early return to the pool, release on
callback failure, and connection destruction when unlocking fails.

## Re-running

With an isolated, migrated PostgreSQL database, MinIO, and the compiled API:

```text
pnpm --filter @portfolio/database build
pnpm --filter @portfolio/api build
pnpm --filter @portfolio/database test
pnpm --filter @portfolio/api verify:blog
```

`verify:blog` requires `DATABASE_URL`, `API_ORIGIN`, `WEB_ORIGIN`, and
`RECOVERY_SECRET`, matching the running API. It deliberately creates fixture
users/content and tampers with fixture digests/revisions. **Never point it at
production or a database containing content you want to preserve.**

Signed invalidation delivery remains backed by the M4 end-to-end evidence;
this run proves publication and durable outbox atomicity. It does not claim a
production deployment or resolve the separately tracked shared-cache ADR.
