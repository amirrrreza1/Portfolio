# M4 project detail and image boundary

Run date: **2026-08-14**

## Scope

- Database: the disposable PostgreSQL 17 instance used by the M1/M2 proof
- Object store: the private MinIO configuration used by the public API
- Data: the deterministic migration's 14 enabled, non-archived projects
- Secrets and disposable credentials are intentionally omitted

The frozen inventory states that the legacy portfolio has no project images and
no long descriptions. The applied database agreed: all 14 public projects had
`imageId = null`, and all 14 English project translations had
`longDescription = null`. No replacement image or prose was invented to make
the new fields appear populated.

## Contract and API proof

`GET /api/v1/public/:locale/projects/:slug` now returns a strict detail DTO with
the public project fields, ordered enabled skills, optional dates, optional
validated Markdown, and an optional image descriptor. English and Persian live
requests for `portfolio` both returned `200`, the requested
`Content-Language`, the exact migrated title/summary, five ordered skills, and
`null` for both absent fields. The Persian request used the documented English
portfolio fallback. Neither response contained a legacy ID, media ID, object
key, checksum, version, or archive metadata.

An immediate `If-None-Match` replay returned `304` with no response body. An
unknown slug returned the stable `NOT_FOUND` response. Temporarily setting the
disposable `portfolio` row to `enabled = false` made that same detail URL return
`404`; restoring the row returned it to `200`.

`GET /api/v1/public/projects/:slug/image` authorizes the project relationship
and accepts only an enabled, non-archived project linked to a verified, public,
non-archived `IMAGE`. It reads the private object only after that database
check, verifies the stored byte size, and emits an allowlisted image MIME type,
checksum ETag, long cache policy, inline disposition, and `nosniff`. Service and
controller fixtures exercise successful delivery, storage-key stripping, and
byte verification. The live `portfolio` image URL correctly returned `404`
because no source image exists.

## Web and rollback proof

The localized project cards now link to `/[locale]/projects/[slug]`. Fresh
database-mode renders of `/en/projects/portfolio` and
`/fa/projects/portfolio` returned `200` and contained the exact title, summary,
repository URL, and migrated skill names. They contained no storage key or
legacy ID, and no image URL was fabricated. A missing detail route returned a
real Next.js `404`.

Fresh legacy-mode renders of the same two routes also returned `200` while
`API_INTERNAL_ORIGIN` pointed to an unreachable port. The legacy adapter
derived the same deterministic slug and returned the frozen title, summary,
links, and skills without consulting the API. Its missing slug also returned
`404`.

A fresh database-mode process with an unreachable API rendered localized alert
documents for both locales and did not synthesize the project summary,
repository URL, or internal fields. Those controlled outage pages still return
HTTP `200`; M4's milestone-wide HTTP `503` gate therefore remains open.

## Automated verification

- Contracts: 292 tests across 12 files
- Auth core: 7 tests
- Content store: 11 tests
- Database: 34 tests
- Markdown: 10 tests, including the standalone safe Markdown body pipeline
- Media: 3 tests
- Migration: 14 tests across 5 files
- API: 35 tests across 7 files
- Web: 57 tests across 13 files
- Total: **463 tests across 42 files**, all passing
- All affected TypeScript checks and API/web lint passed.
- The API build passed.
- The Next.js production build passed and emitted dynamic
  `/[locale]/projects/[slug]` alongside the existing localized routes.

No temporary API/Next listener remained after the run, the temporary database
disable was restored, and no generated `AGENTS.md` or `CLAUDE.md` file remained
under `apps/web`.
