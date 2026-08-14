# M4 homepage collections and document-delivery proof

Run date: **2026-08-14**  
Scope: homepage projects/skills, daily quote, certificates, active resume, private object delivery, rollback, and outage behavior  
Result: **Passed for this slice; M2 and M4 remain in progress**

## Environment

- API: NestJS/Fastify on `127.0.0.1:4403`
- Web: Next.js 16 development server on `127.0.0.1:3303`
- Database: the disposable PostgreSQL 17 instance used for the M1/M2 proof
- Object store: the private MinIO bucket used for the applied M2 migration
- Data: the deterministic M1 structural seed plus reconciled M2 portfolio/media rows
- Secrets and disposable credentials are intentionally omitted

## Public homepage API

`GET /api/v1/public/en/home` and `GET /api/v1/public/fa/home` returned:

- HTTP `200` with the matching `Content-Language`;
- one server-selected quote, five enabled/non-archived certificates, and the
  single active resume;
- `Cache-Control: public, max-age=0, s-maxage=300, stale-while-revalidate=3600`;
- an `ETag` whose `If-None-Match` replay returned HTTP `304` with a zero-byte
  body;
- no `Vary: Cookie`; and
- no storage key, media ID, checksum, legacy ID, version, or timestamp.

The Persian payload deliberately fell back to English for the migrated quote
and certificate fields that do not yet have Persian translations.

## Private MinIO document delivery

The JSON DTO exposes only opaque certificate routes and one fixed active-resume
route. It never exposes a MinIO origin, credential, bucket, or object key.

Every certificate route returned `application/pdf`, attachment disposition,
`X-Content-Type-Options: nosniff`, an object-checksum ETag, and byte content that
matched the frozen legacy file:

| Certificate  |   Bytes | Matching frozen file | Conditional replay |
| ------------ | ------: | -------------------- | ------------------ |
| Web Design 1 | 514,902 | `Web-1.pdf`          | `304`, zero bytes  |
| Web Design 2 | 519,381 | `Web-2.pdf`          | `304`, zero bytes  |
| Web Design 3 | 512,759 | `Web-3.pdf`          | `304`, zero bytes  |
| React JS     | 502,807 | `React.pdf`          | `304`, zero bytes  |
| Next JS      | 515,726 | `Next.pdf`           | `304`, zero bytes  |

`GET /api/v1/public/resume/file` returned the single active private object as
`Amirreza-Azarioun-Resume.pdf`. Its 279,876 bytes and SHA-256 matched the frozen
`apps/web/public/resume.pdf`; the conditional replay returned `304` with a
zero-byte body. Resume cache lifetime is five minutes, matching ADR-014.
The controller resolves checksum metadata before object access, and the focused
API test proves a matching conditional request does not read the MinIO object.

## Database-backed rendered homepage

The web server ran with:

```text
PORTFOLIO_DATA_SOURCE=database
API_INTERNAL_ORIGIN=http://127.0.0.1:4403
```

`/en` and `/fa` returned HTTP `200`. Their initial HTML contained the selected
API quote, all five certificate titles, opaque API certificate/resume paths,
and identifiers from the database projects/skills DTO. Both rendered
navigation and no unavailable state.

The Next.js same-origin `/api/v1/*` rewrite returned the active resume through
the web origin with the same 279,876 bytes, SHA-256, MIME type, and attachment
disposition. Browser code therefore needs neither the internal API origin nor
MinIO topology.

## Isolated legacy rollback

The web server was restarted with:

```text
PORTFOLIO_DATA_SOURCE=legacy
API_INTERNAL_ORIGIN=http://127.0.0.1:1
```

Both locales still returned HTTP `200`, all five certificates, a quote, and
the resume CTA. HTML used `/Certificates/Web-1.pdf` and `/resume.pdf`, contained
no API-backed document path, rendered navigation, and showed no unavailable
state. The static resume returned the expected 279,876-byte PDF. This proves
the rollback source did not call the unreachable API.

## Outage behavior

A fresh database-mode process with a wholly unreachable API failed closed at
the already-proven root appearance boundary and rendered no navigation.

A second fresh process used a temporary local fault proxy that forwarded the
real site, appearance, and projects endpoints but returned `503` only for the
new `/home` endpoint. `/en` and `/fa` preserved their database-backed
navigation while rendering the exact localized homepage `role="alert"` state;
neither certificate nor resume content was synthesized.

Both controlled documents still returned HTTP `200`. Converting public-data
cold/expired outage documents to HTTP `503` remains an explicit M4 gate.

## Automated verification

- Contracts: 12 files and 290 tests passed.
- API: 7 files and 30 tests passed.
- Web: 12 files and 53 tests passed.
- Auth core, content store, database, Markdown, media, and migration: 9 files
  and 74 tests passed; the repository total is 40 files and 447 tests.
- Contract, API, and web TypeScript checks passed.
- Declared API source lint and full web lint passed.
- Contract, API, and configured Next.js production builds passed.

Coverage includes strict DTOs, unsafe paths/URLs/dates, internal-field
rejection, enabled/archive/media predicates, locale fallback, stable UTC quote
selection, active-resume selection, byte-size integrity, opaque file routing,
ETag/`304` without an object read, resource/locale cache isolation, database/legacy source
exclusivity, and confinement of all legacy JSON imports to one server adapter.

## Limits of this evidence

- Hero/About prose remains component-owned because the database contains only
  the deliberate M1 placeholder; it must be migrated without losing fidelity
  before cutover.
- Page-section enable/disable/order is not yet the homepage render plan.
- Project images and full project detail remain outside the current public DTO.
- Persian quote/certificate translations have not been authored and therefore
  use the specified English portfolio fallback.
- The controlled outage response still has HTTP status `200`, not `503`.
