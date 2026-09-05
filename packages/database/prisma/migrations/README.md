# Migrations

Two migrations make up the initial schema, and they must be created in this
order. Two further forward-only migrations follow them and are described at the
bottom of this file.

## Why two

Prisma's schema language has no syntax for `CHECK` constraints, partial unique
indexes, or expression indexes. `prisma migrate dev` therefore emits the tables,
foreign keys, and plain indexes, and everything in
[`../sql/integrity_constraints.sql`](../sql/integrity_constraints.sql) is applied
as a second, hand-written migration.

Those constraints are not decoration. Several of them are the only thing between
a bug in application code and a row the rest of the system assumes cannot exist
— a `PUBLISHED` translation with no `publishedAt`, two simultaneously active
resume versions, a quarantined upload marked public.

## Creating them

From the repository root, with `DATABASE_URL` pointing at your database:

```bash
# 1. Tables, foreign keys, and indexes, generated from schema.prisma.
pnpm --filter @portfolio/database exec prisma migrate dev --name init

# 2. An empty migration for the constraints, created but not applied.
pnpm --filter @portfolio/database exec prisma migrate dev --create-only --name integrity_constraints

# 3. Copy the SQL into the migration Prisma just created, then apply it.
pnpm --filter @portfolio/database db:constraints
pnpm --filter @portfolio/database exec prisma migrate dev
```

Step 3 uses a script rather than a manual copy for one reason: if you forget the
copy, step 4 applies an **empty** migration, Prisma records it as applied, and
the database silently has no constraints. The script fails loudly if it cannot
find the migration directory.

Then seed:

```bash
pnpm --filter @portfolio/database db:seed
```

## Verifying

```bash
pnpm --filter @portfolio/database test
```

The constraint suite generates DDL with `prisma migrate diff --from-empty`,
applies it plus the constraints to an in-process PostgreSQL (PGlite), and
asserts that each constraint rejects what it claims to. It needs no database
server, so it runs in CI.

Generating the DDL rather than hand-maintaining a copy is deliberate: a copy
would drift from `schema.prisma` and then verify the wrong shape, which is worse
than not testing at all.

## Migrating from zero

The M1 exit gate is that a clean database migrates from zero and seeds
deterministically. To check that:

```bash
pnpm --filter @portfolio/database exec prisma migrate reset --force
pnpm --filter @portfolio/database db:seed
pnpm --filter @portfolio/database db:seed   # second run must change nothing
```

The seed asserts its own row counts and fails if they differ, so a second run
that produced duplicates would error rather than pass quietly.

## Migrations added without a database

`20260816150000_content_jobs` and `20260825120000_postgres_native_articles` were
hand-written. Every migration before them came from `prisma migrate dev` against
a live database; these did not, because the changes were authored where no
PostgreSQL instance was reachable.

Verify it before trusting it:

```bash
pnpm --filter @portfolio/database exec prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "$SHADOW_DATABASE_URL" --script
```

An empty result means the migration and the schema agree. Any output means the
hand-written file is wrong and the generated statements are right.

They also differ from the initial pair in carrying their own `CHECK` constraints
and partial indexes rather than deferring them to a second migration. That split
existed so hand-written constraints could be staged into a _generated_ file, and
there is nothing to stage when the whole file is hand-written. The annotated
copy of those constraints still lives in
[`../sql/integrity_constraints.sql`](../sql/integrity_constraints.sql), which is
what a fresh database and `test/constraints.spec.ts` apply.

## `20260825120000_postgres_native_articles`

[ADR-015](../../../../docs/DECISIONS.md#adr-015--postgresql-native-article-authoring-and-publication)
makes PostgreSQL the sole authority for article bodies. This migration adds
`bodyMarkdown` and `bodySha256`, replaces the draft blob token with an integer
`baseVersion`, and drops the Git synchronization columns, tables, and enum
types.

Two details are deliberate and should not be "tidied":

- **`bodyMarkdown` is nullable.** Rows written by the Git-index era have no
  recoverable Markdown, and inventing source for them would publish text nobody
  wrote. The migration demotes every such row to `DRAFT` instead, the
  `post_translations_published_has_source` constraint stops it from returning to
  `PUBLISHED`, and the public partial indexes exclude it. Those rows stay
  invisible until they are explicitly reimported.
- **The historical migrations still create what this one drops.** They are
  frozen history, not a description of the current schema. A database migrated
  from zero passes through the Git-era shape and comes out the other side
  without it; `verify:articles` asserts exactly that against a real server.

Verify it the same way as `content_jobs`, with `prisma migrate diff`. The
verification script `scripts/verify-article-authority.ts` covers the behaviour
the diff cannot: constraints rejecting what they claim to, rollback leaving no
partial state, and publication running with no network.

## `20260905120000_m9_operations`

M9 adds bounded contact-delivery attempt state and a due-retry index. Failure
details are operational codes capped at 160 characters; provider responses and
message bodies are never duplicated into the error field. The maintenance
worker treats `FAILED` plus a null `nextAttemptAt` as an exhausted visible dead
letter and purges the complete message only at its stored retention deadline.
