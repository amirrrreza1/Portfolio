# @portfolio/database

Prisma schema, migrations, and the PostgreSQL client.

**Server-only.** Nothing that runs in a browser may import this package. The
connection string, the pool, and every credential live behind this boundary;
`@portfolio/contracts` exists so the web and API sides can share validation
without sharing this.

## Layout

| Path                                   | Purpose                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `prisma/schema.prisma`                 | Every model, enum, relation, and index from [DATA_MODEL.md](../../docs/DATA_MODEL.md)            |
| `prisma/sql/integrity_constraints.sql` | `CHECK` constraints, partial unique indexes, and partial read indexes that Prisma cannot express |
| `prisma/seed.ts`                       | Deterministic seed for the settings singletons, page sections, navigation, and social links      |
| `src/client.ts`                        | Pooled client through the `pg` driver adapter                                                    |
| `src/concurrency.ts`                   | Optimistic-concurrency and advisory-lock helpers                                                 |
| `test/constraints.spec.ts`             | Proves each constraint rejects what it claims to, using an in-process PostgreSQL                 |

## First run

The generated client is git-ignored, so a clean checkout must generate it before
this package will build:

```bash
pnpm --filter @portfolio/database db:generate
```

Then follow [prisma/migrations/README.md](prisma/migrations/README.md) to create
the two initial migrations and seed.

## Why the constraints are separate

Prisma's schema language has no syntax for `CHECK` constraints, partial unique
indexes, or expression indexes. Those are not decoration here — several are the
only thing between a bug in application code and a row the rest of the system
assumes cannot exist:

- a `PUBLISHED` translation with no `publishedAt`, or with no body in Git;
- two simultaneously active resume versions;
- a quarantined upload marked public;
- a cached render with no recorded provenance, which cannot be identified as stale.

Application validation catches the honest mistake and gives a good error
message. The constraint catches the race, the direct `psql` session, and the
migration script.

## Testing without a database server

`pnpm --filter @portfolio/database test` generates DDL with
`prisma migrate diff --from-empty`, applies it plus the constraints to PGlite —
PostgreSQL compiled to WebAssembly — and asserts the rejections. No server, no
container, so it runs in CI today rather than waiting for M9.

Generating the DDL rather than hand-maintaining a copy is deliberate: a copy
would drift from `schema.prisma` and then verify the wrong shape.
