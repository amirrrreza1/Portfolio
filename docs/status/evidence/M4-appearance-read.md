# M4 appearance public-read proof

Run date: **2026-08-14**  
Scope: locale-scoped public appearance settings, first-response preferences, rollback, and cold-outage behavior  
Result: **Passed for this slice; M4 and M5 remain in progress**

## Environment

- API: NestJS/Fastify on `127.0.0.1:4402`
- Web: Next.js 16 development server on `127.0.0.1:3302`
- Database: the disposable PostgreSQL 17 instance used for the M1/M2 proof
- Data: the deterministic appearance-settings seed
- Secrets and disposable credentials are intentionally omitted

## Public API result

`GET /api/v1/public/en/appearance` and
`GET /api/v1/public/fa/appearance` returned HTTP `200`, matching
`Content-Language`, an `ETag`, and:

```text
Cache-Control: public, max-age=0, s-maxage=3600, stale-while-revalidate=86400
```

The English projection enabled `dark` and `light`, defaulted to `dark`, exposed
four size steps, and offered JetBrains Mono, Vazir Code, and System sans. The
Persian projection exposed only the script-compatible Vazir Code and System
sans options and defaulted to Vazir Code. Neither payload exposed record
versions, the other locale's font-default map, or creation/update timestamps.

Repeating each request with its `ETag` in `If-None-Match` returned HTTP `304`
with a zero-byte body. Neither public response varied on `Cookie`.

## Database-backed first response

The web server ran with:

```text
PORTFOLIO_DATA_SOURCE=database
API_INTERNAL_ORIGIN=http://127.0.0.1:4402
```

`/en` and `/fa` returned HTTP `200` with `data-theme="dark"` and
`data-motion="system"` in the initial `<html>`. English rendered all three
font options; Persian rendered Vazir Code and System sans but not JetBrains
Mono. Both pages rendered navigation and no unavailable state.

A Persian request carrying a valid `light`, `xl`, and `reduced` preference plus
an incompatible JetBrains Mono request returned initial HTML with
`data-theme="light"`, `data-motion="reduced"`, the XL preference, and Vazir
Code selected. The resolved state marked the visitor cookie as corrected. This
proves the visitor choice is honored only within the locale-scoped owner
allowlist. The HTML response did not send `Vary: Cookie`.

## Isolated legacy rollback

The web server was restarted with:

```text
PORTFOLIO_DATA_SOURCE=legacy
API_INTERNAL_ORIGIN=http://127.0.0.1:1
```

The deliberately unreachable API origin prevents the database client from
supplying settings. `/en` and `/fa` still returned HTTP `200`, the expected
locale-compatible options, navigation, and no unavailable state. This proves
the explicit rollback source does not call or depend on the public API.

## Cold-outage behavior

A fresh process ran with `PORTFOLIO_DATA_SOURCE=database` and the same
unreachable API origin. `/en` and `/fa` rendered localized `role="alert"`
documents with safe `dark`/`system` attributes and no navigation. No legacy
settings or shell content were synthesized, and the fresh process had no
last-known-good entry to serve.

The responses were HTTP `200`; returning HTTP `503` for controlled cold or
expired outages remains an explicit M4/M5 gate.

## Automated verification

- Contracts: 11 files and 284 tests passed.
- API: 6 files and 22 tests passed.
- Web: 10 files and 48 tests passed.
- Contract, API, and web TypeScript checks passed.
- API and web ESLint checks passed.
- Contract, API, and configured Next.js production builds passed.

Coverage includes strict public DTOs, registry-owned display names,
script-compatible locale projection, internal-field rejection, service query
projection, ETag/`304`, locale- and resource-isolated bounded fallback, source
exclusivity, cookie-independent cache keys, cookie tampering correction, and
first-response root attributes.

## Limits of this evidence

- The full THEMING §9 contrast, hydration, system-mode, no-JavaScript, CSP,
  error-page, font-download, and blog-scoping matrix is not complete.
- The semantic token vocabulary, font subsetting/`unicode-range`, and optional
  route-scoped font delivery remain open.
- The one-time legacy `localStorage` preference migration remains undecided.
- Resume, project detail, editable homepage content, and articles remain
  outside this public-read slice.
- The controlled cold-outage document still returns HTTP `200`, not `503`.
