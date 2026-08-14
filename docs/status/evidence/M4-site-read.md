# M4 site-shell public-read proof

Run date: **2026-08-14**  
Scope: localized site settings, page-section metadata, navigation, and social links  
Result: **Passed for this slice; M4 remains in progress**

## Environment

- API: NestJS/Fastify on `127.0.0.1:4401`
- Web: Next.js 16 development server on `127.0.0.1:3301`
- Database: the disposable PostgreSQL 17 instance used for the M1/M2 proof
- Data: the deterministic M1 structural seed plus the reconciled M2 portfolio migration
- Secrets and disposable credentials are intentionally omitted

## Public API result

`GET /api/v1/public/en/site` returned:

- HTTP `200`
- locale/header `en`
- site name `Amirreza Azarioun`
- 6 enabled, non-archived page sections
- 6 enabled navigation items
- 4 enabled social links
- `Cache-Control: public, max-age=0, s-maxage=300, stale-while-revalidate=3600`
- `ETag: "lwQsIM0SdZG8iJuHCZuTE3R0eg6jh8shWComp1oQn_Y"`

`GET /api/v1/public/fa/site` returned locale/header `fa`, site name `امیررضا آذریون`, first navigation label `خانه`, and first section title `امیررضا آذریون`. Its ETag was `"xxPknItyQ3XHtVIkE8Ad1DRoyDCha9ArSWHFV5CuwyQ"`; repeating the request with that value in `If-None-Match` returned HTTP `304` with a zero-byte body.

Neither response contained `contactRecipientEmail`, `searchConsoleTokens`, or record `version` fields.

## Database-backed rendered shell

The web server ran with:

```text
PORTFOLIO_DATA_SOURCE=database
API_INTERNAL_ORIGIN=http://127.0.0.1:4401
```

`/fa`, `/fa/projects`, and `/en` returned HTTP `200`. The Persian page contained `خانه`, `پروژه‌ها`, a locale-prefixed `/fa/projects` link, and the database-seeded Telegram and Daramet URLs. It contained neither the legacy email address nor the CoffeeBede URL and did not render the unavailable state. These distinct values prove the database source supplied the shell.

## Isolated legacy rollback

The web server was restarted with:

```text
PORTFOLIO_DATA_SOURCE=legacy
API_INTERNAL_ORIGIN=http://127.0.0.1:1
```

The deliberately unreachable API origin prevents the database client from supplying a response. `/fa` and `/fa/projects` still returned HTTP `200`, with Persian navigation and `/fa/projects`. The page contained the legacy email and CoffeeBede URLs and contained neither the database Telegram nor Daramet URLs. These distinct markers prove the explicit rollback source rendered.

## Cold-outage behavior

A fresh web process ran with `PORTFOLIO_DATA_SOURCE=database` and the same unreachable API origin. Both `/en` and `/fa` rendered their localized controlled-unavailable messages without navigation, so a cold failure did not synthesize data or cross locale boundaries.

The responses were HTTP `200`; converting controlled cold/expired outage pages to HTTP `503` remains an explicit M4 gate.

## Automated verification

- Contracts: 11 files and 280 tests passed.
- API: 5 files and 19 tests passed.
- Web: 8 files and 44 tests passed.
- Contract, API, and web TypeScript checks passed.
- The touched API and web source paths passed ESLint and Prettier.
- Contract, API, and configured Next.js production builds passed. The web build used database selection with an unreachable API origin and retained dynamic server rendering for `/[locale]` and `/[locale]/projects`.

Coverage includes strict DTO allowlists, section-key JSON validation, public protocol/target validation, enabled/non-archived predicates, locale fallback, ETag/`304`, resource- and locale-isolated client caches, source exclusivity, malformed/cross-locale failure, and browser/server package boundaries.

## Limits of this evidence

- The site endpoint exposes validated section metadata, but the current Hero/About/Skills/Projects/Certificates/Contact components have not all been converted to render those payloads.
- Appearance was outside this run; it is now proven separately in [`M4-appearance-read.md`](M4-appearance-read.md).
- Resume, certificates, quotes, project detail, and article reads remain outside this slice.
- HTTP `503`, message catalogs, root locale negotiation, GitHub caching, and publication invalidation remain open.
