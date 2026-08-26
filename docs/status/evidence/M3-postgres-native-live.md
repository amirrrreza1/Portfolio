# PostgreSQL-native articles — live run

Date: **2026-08-26**  
Milestone: [M3](../M3.md)  
Normative decision: [ADR-015](../../DECISIONS.md#adr-015--postgresql-native-article-authoring-and-publication)

Supersedes the Git-backed [M3 historical live run](M3-live-run.md), which
proved an architecture the platform no longer has.

## What was run

A real PostgreSQL server process, migrated from an empty database, driving the
shipped code with no stubs in the write path:

- **Database** — PostgreSQL 16.13 server (`initdb` + `pg_ctl`, TCP on
  `127.0.0.1:5433`), starting from `CREATE DATABASE`. All four migrations
  applied in order, each inside a single transaction:

  ```
  20260814143856_init                       161 ms
  20260814143905_integrity_constraints       44 ms
  20260816150000_content_jobs                36 ms
  20260825120000_postgres_native_articles    41 ms
  ```

- **Repository** — the actual `createArticleStore`, `enqueueDuePublications`,
  and `publishDueTranslation` from `packages/database/src/articles.ts`, through
  the real Prisma client and the real `@prisma/adapter-pg` driver adapter.
- **Renderer** — the actual `renderArticleBody` from `@portfolio/markdown`.
  Nothing about the render is faked, including its refusals.
- **Contracts** — every fixture frontmatter is produced by
  `frontmatterSchema.parse`, so a fixture that drifted from the contract would
  fail in the fixture rather than look like a store rejection.
- **Queue** — the real `createContentJobStore` over `createPrismaSqlExecutor`,
  so the claim runs as `FOR UPDATE SKIP LOCKED` against the server.

The run is `packages/database/scripts/verify-article-authority.ts`, committed
and re-runnable:

```bash
DATABASE_URL=... pnpm --filter @portfolio/database verify:articles
```

It is destructive, refuses to start without `--apply`, and rebuilds its own
fixture namespace first, so consecutive runs are deterministic.

## Result

`ALL CHECKS PASSED — 44 checks`, in seven sections.

### 0. The Git era is gone from the schema

```
PASS  no Git synchronization table or type survives the forward migration
PASS  ContentJobKind is reduced to publication work only  — PUBLISH_DUE
```

`content_sync_logs`, `content_write_operations`, `content_apply_ledger`,
`webhook_deliveries`, `SyncState`, `SyncTrigger`, `SyncOutcome`, and
`ContentWriteOperationState` are all absent after migrating from zero, even
though the frozen initial migration still creates them. `post_translations` has
`bodyMarkdown` and `bodySha256` and no longer has `sourceBlobSha`, `syncState`,
`syncError`, or `lastSyncedAt`; `post_drafts` carries `baseVersion` instead of
`baseBlobSha`.

### 1. Bilingual authoritative source

```
PASS  one post carries an independent English and Persian translation
PASS  PostgreSQL holds the complete Markdown source for both locales  — en:322B fa:142B
PASS  every stored digest matches one PostgreSQL recomputes from the source
PASS  the render cache carries its renderer provenance and reading metadata
PASS  the cached render is the sanitized production render, not the raw source
PASS  editorial metadata and taxonomy landed with the source
PASS  each first save wrote exactly one CREATE revision at version 0
PASS  each save queued exactly one locale-scoped invalidation event
```

The digest check is deliberately not the application's own arithmetic. It is

```sql
encode(sha256(convert_to("bodyMarkdown", 'UTF8')), 'hex') = "bodySha256"
```

evaluated by PostgreSQL. A digest that only the writer verifies proves the
writer is self-consistent and nothing else.

### 2. Revisions are append-only

```
PASS  an accepted save advances the integer version  — version=1
PASS  the update appended an UPDATE revision instead of rewriting history
PASS  the earlier revision still holds the source it was written with
PASS  PostgreSQL refuses a second revision for the same entity version
```

The last line is the database refusing the write, not the application declining
to attempt it: `content_revisions_entityType_entityId_entityVersion_key`.

### 3. A rejected save changes nothing

```
PASS  a stale integer version is refused as a conflict
PASS  the stale save left article, revision, outbox, and audit state untouched
PASS  an unknown tag reference is refused
PASS  a quarantined media reference is refused rather than published
PASS  a private media reference is refused rather than leaked onto a public page
PASS  a body with no readable Markdown is refused
PASS  a raw script element is refused or defused before it can be stored
PASS  an inline event handler is refused or defused before it can be stored
PASS  a javascript: link target is refused or defused before it can be stored
PASS  a data: link target is refused or defused before it can be stored
PASS  none of the invalid saves changed any article, revision, or outbox row
```

Each of the four unsafe bodies was **refused** outright by the sanitize-last
renderer rather than stored and cleaned, which is the stronger of the two
acceptable outcomes.

"Changes nothing" is asserted against a snapshot of every article column, the
revision count, the outbox count, the audit count, and the post-tag rows, taken
before the first rejection and compared after the last.

### 4. A forced transaction failure rolls everything back

Two failures, because a constraint violation and a late failure are different
shapes:

```
PASS  a unique-constraint violation mid-transaction aborts the save
PASS  the tag rows the aborted transaction had already rewritten were restored
PASS  no partial article, revision, audit, or invalidation row survived
PASS  the injected post-write failure propagates
PASS  source, render, revision, audit, and invalidation state are unchanged
PASS  no trace of the rolled-back body is searchable in the source column
```

**(a)** A second post already held the target `(locale, slug)`, so `post.upsert`
and the tag rewrite committed logically before `postTranslation.updateMany`
failed. The tag rows came back, which is the part a "did the row appear?" check
would have missed.

**(b)** An injected failure thrown _after_ every write in the transaction had
succeeded, including the outbox row. This is the case no constraint can
produce, and it is the one ADR-015 exists to make impossible: the whole unit of
work vanished.

### 5. Legacy rows fail closed

```
PASS  PostgreSQL refuses a PUBLISHED translation with no Markdown source
PASS  a sourceless legacy row is invisible to the public listing predicate
```

A direct `INSERT` of a Git-index-era row with `status = 'PUBLISHED'` and no
`bodyMarkdown` is rejected by
`post_translations_published_has_source`. Inserted as a `DRAFT` it is accepted
and then excluded by the partial index the public listing uses. Nothing
reconstructs source for it; it stays unavailable until it is reimported.

### 6. Publication is database-native and idempotent

```
PASS  scheduling is realized state in PostgreSQL, not a file annotation
PASS  nothing is queued before the scheduled time
PASS  a due translation is enqueued once and deduplicated on the next tick
PASS  the scheduler claims the publication job under FOR UPDATE SKIP LOCKED
PASS  a second worker cannot claim the same job while the lease holds
PASS  publication succeeds once and is a no-op when replayed
PASS  publication completed with every socket except PostgreSQL sealed
PASS  the published row satisfies the source-integrity constraint
PASS  publication appended its own revision and invalidation event
```

"Requires no Git access" is asserted rather than assumed. Before the
publication section, `fetch`, `http.request`, `http.get`, `https.request`, and
`https.get` are replaced with functions that count the attempt and throw.
node-postgres builds its own `net.Socket`, so the database connection is
deliberately left open — the claim is that publication needs no _remote
service_, not that it needs no socket. The counter finished at zero.

### 7. A real bilingual article is live

```
en  v3  database-native-articles  sha=6fb74a340881…  renderer=1  1 min
fa  v1  مقاله-های-پایگاه-داده      sha=d3c988c0a778…  renderer=1  1 min
```

English reached `PUBLISHED` through the scheduler; Persian through an explicit
published save. The two carry different slugs and independent versions, which
is ADR-005's asymmetry working. A final sweep confirmed no row anywhere in the
database holds a digest that disagrees with its own source.

## What the run found

**Every article with a cover or social image was unsavable.** `assertMedia`
filtered `media_assets` on `status: "READY"` — a column that does not exist on
that table, with a value that is not in any of its enums. The real column is
`processingState`, and the value is `VERIFIED`. Prisma would have thrown
`Unknown argument 'status'` on the first save carrying an image.

Two things hid it. The repository takes its transaction client as `prisma: any`
(the interactive-transaction callback is not generically typed), so the
compiler had nothing to check. And the unit test mocked `mediaAsset.count`,
which means it asserted that the code calls a function, not that the query is
answerable.

Fixed by using the predicate the public read paths already use — verified,
public, not archived, and `IMAGE` — so a quarantined or private asset cannot
become a broken or leaking image on a published page. `test/articles.spec.ts`
now asserts the shape of that `where` clause, and fails against the old code.

**PostgreSQL was stricter than the fixture.** The first attempt at a
quarantined-media fixture was rejected by `media_assets_quarantine_is_private`,
an M1 constraint that will not let a quarantined asset be public. The negative
cases were split into an unverified asset and a private one, which is a better
test than the one originally written.

**A webhook option outlived its webhook.** `APPLICATION_OPTIONS` still carried
`rawBody: true`, which existed solely so the removed Git content webhook could
verify an HMAC over the exact bytes GitHub sent. Nothing in the API reads
`req.rawBody`; the option was buffering every request body for a caller ADR-015
deleted. Removed, with the reasoning kept in the comment.

## What this does not prove

- **Not PostgreSQL 17.** M1 and M2 were proven on 17; this sandbox has 16.13
  and the PGDG repository is unreachable from it. Nothing exercised here is
  version-specific — `sha256()`, partial indexes, `FOR UPDATE SKIP LOCKED`, and
  `CHECK` semantics are all long-standing — but the production target should be
  re-confirmed on 17 in CI.
- **Migrations were applied with `psql`, not `prisma migrate deploy`.**
  `binaries.prisma.sh` returns `403` through this sandbox's proxy, so the
  schema engine cannot be fetched. Each `migration.sql` was applied verbatim in
  lexical order inside a single transaction, and `_prisma_migrations` was
  written with each file's real SHA-256, so a subsequent `migrate deploy`
  against this database is a no-op. The applied SQL is identical; the ledger
  bookkeeping is what was done by hand.
- **No `prisma migrate diff` drift check.** Same cause. That schema.prisma and
  the migration chain agree is asserted here structurally — every column,
  index, and constraint on the M3 tables was inspected against the model — not
  by the diff. The diff, `test/constraints.spec.ts`, and
  `test/content-jobs.spec.ts` all derive DDL from the schema engine and remain
  CI-verified.
- **No public route.** Nothing here rendered a page. The M4 article path reads
  these rows and re-verifies the digest on read; proving that is M4's gate.
- **No end-to-end invalidation.** Outbox rows were written and asserted; the
  drain, the signature, and the receiver were not exercised. That chain is
  proven separately in [M4-invalidation-live.md](M4-invalidation-live.md) and
  connecting the two is M4's remaining work.
- **No MinIO.** Media rows were fixtures. Object storage is untouched by the
  article write path, which is the point of ADR-015's split, but it does mean
  the media identity contract is not re-proven here.
- **One process.** Job-level lease contention was exercised with a second
  claimant; the scheduler's `pg_advisory_lock` across two worker processes was
  not.
