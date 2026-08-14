# M4 projects public-read proof

Run date: **2026-08-14**  
Scope: the projects vertical slice only  
Result: **Passed for this slice; the M4 milestone remains in progress**

## Environment

- API: NestJS/Fastify on `127.0.0.1:4400`
- Web: Next.js 16 development server on `127.0.0.1:3300`
- Database: the disposable PostgreSQL 17 instance used for the M1/M2 proof
- Data: the reconciled M2 legacy migration
- Secrets and disposable credentials are intentionally omitted

## Public API result

`GET /api/v1/public/en/projects` returned:

- HTTP `200`
- locale `en`
- 14 enabled, non-archived projects
- 6 enabled skill categories and 26 enabled skills
- `Content-Language: en`
- `Cache-Control: public, max-age=0, s-maxage=300, stale-while-revalidate=3600`
- `Last-Modified: Fri, 14 Aug 2026 14:58:34 GMT`
- `ETag: "JytDdr_qaAYHKQSzbOXqqnlhQFnguzqqvzKV1TkyYvs"`

Repeating the request with that value in `If-None-Match` returned HTTP `304` and a zero-byte body.

`GET /api/v1/public/fa/projects` returned the same resource counts, locale/header `fa`, and the first title `Portfolio`. That title proves the specified Persian-to-English fallback for a missing Persian portfolio field.

## Rendered database path

The web server ran with:

```text
PORTFOLIO_DATA_SOURCE=database
API_INTERNAL_ORIGIN=http://127.0.0.1:4400
```

Both `/en/projects` and `/fa/projects` returned HTTP `200`, rendered project content, and did not render the controlled-unavailable state. The returned HTML did not contain the internal field names `legacyId` or `storageKey`.

## Rendered rollback path

The web server was restarted with:

```text
PORTFOLIO_DATA_SOURCE=legacy
API_INTERNAL_ORIGIN=http://127.0.0.1:1
```

The deliberately unreachable API origin ensures the database client could not have supplied the response. Both `/en/projects` and `/fa/projects` still returned HTTP `200`, rendered project content, and avoided the unavailable state. This proves the explicit legacy rollback selection for the projects route.

## Automated coverage

- Shared DTO allowlist, locale rules, archived-status rejection, and internal-field stripping.
- API envelope/headers, conditional `304`, invalid locale, enabled/public predicates, fallback behavior, and non-leakage.
- Web origin validation, timeout/failure classification, validated bounded last-known-good fallback, conditional revalidation, malformed-cache rejection, and locale isolation.
- Source selection tests prove the selected dependency is the only dependency invoked.
- Client/server boundary tests prevent database imports and server-only code from entering browser graphs.

Verification results for the affected worktree:

- Contracts: 10 files and 272 tests passed.
- API: 4 files and 16 tests passed.
- Web: 6 files and 40 tests passed.
- Contract, API, and web TypeScript checks passed.
- The new API and web source paths passed ESLint; all touched source/status files passed Prettier.
- Contract and API production builds passed.
- The Next.js production build passed with `PUBLIC_SITE_URL`, `API_INTERNAL_ORIGIN`, and `PORTFOLIO_DATA_SOURCE=database` set, and reported `/[locale]/projects` as a dynamic server-rendered route.
- All local links across the 12 status Markdown files resolved, and `git diff --check` passed.

## Limits of this evidence

- This proves only the projects list slice; site settings, appearance, resume, project detail, homepage sections, and articles are not yet cut over.
- The localized projects outage view is controlled, but the rendered route does not yet prove HTTP `503` semantics.
- Article publication state and end-to-end invalidation are not covered by this run.
- The deployment default remains legacy until `PORTFOLIO_DATA_SOURCE=database` is explicitly selected.
