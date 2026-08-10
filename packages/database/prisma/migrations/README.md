# Migrations

Two migrations make up the initial schema, and they must be created in this
order.

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
