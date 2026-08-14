# M4 controlled HTTP 503 proof

Date: **2026-08-14**  
Scope: HTTP status behavior for current localized public routes during healthy,
warm-outage, cold-outage, rollback, and not-found conditions

## Delivered boundary

`apps/web/src/proxy.ts` now makes the public-data availability decision before
React rendering or response streaming begins. The route gate in
`apps/web/src/server/public-route-availability.ts` classifies only the current
canonical public documents and reads exactly the DTOs that the route needs:

- every known route checks locale-scoped appearance and site-shell data;
- the localized home route additionally checks both home and project-list data,
  matching the collections it renders;
- the projects route additionally checks the project list;
- project detail additionally checks only its canonical slug;
- unknown paths and malformed slugs bypass the availability gate so their
  normal `404` behavior is preserved.

The gate uses the existing strict public API clients. It therefore applies the
same schema validation, ETag handling, locale/resource-isolated cache keys,
bounded timeout, retryable-failure classification, and 60-minute validated
last-known-good ceiling as the render path. An exact project-detail API `404`
continues to the page's not-found handling; it is never converted into an
outage.

When a database-source route has neither a fresh DTO nor an in-window validated
last-known-good value, the proxy returns a complete response before rendering:

- status `503 Service Unavailable`;
- localized UTF-8 HTML with the correct `lang`, `dir`, and `Content-Language`;
- the catalog-owned unavailable message in an alert landmark;
- `Retry-After: 60`, `Cache-Control: private, no-store`, `noindex`, and the
  normal CSP/security headers;
- no exception message, API origin, stack, stale content, navigation, or
  internal storage detail.

`PORTFOLIO_DATA_SOURCE=legacy` skips the gate entirely. The rollback source
therefore remains independent of API availability.

## Automated proof

The new `apps/web/test/public-route-availability.spec.ts` covers canonical
classification, exact per-route resource scope, controlled unavailability,
project-detail `404`, non-retryable `4xx` propagation, cold failure, validated
warm fallback at the maximum allowed age, and failure one millisecond after
expiry. The routing suite additionally checks the real `503` response headers,
English/Persian document attributes, security policy, no internal-origin leak,
normal `200` continuation, and legacy-source bypass.

Current repository verification:

- 486 tests passed across 46 files in all nine tested apps/packages;
- all nine TypeScript checks passed;
- full API and web ESLint checks passed;
- the configured Next.js 16.3.0 production build compiled, typechecked,
  generated all routes, and emitted the proxy bundle;
- the repository-wide Prettier check and `git diff --check` passed.

## Live production-mode matrix

The built API ran on `127.0.0.1:4405` against the existing PostgreSQL 17 and
private MinIO proof containers. The built Next application ran on
`127.0.0.1:3311` with `PORTFOLIO_DATA_SOURCE=database`.

With the API healthy:

| Request                           | Result |
| --------------------------------- | ------ |
| `/en`                             | `200`  |
| `/fa/projects`                    | `200`  |
| `/en/projects/portfolio`          | `200`  |
| `/en/projects/definitely-missing` | `404`  |
| `/en/unknown`                     | `404`  |

After those DTOs were validated, the API process was stopped without restarting
the web process. `/en`, `/fa/projects`, and `/en/projects/portfolio` all
remained `200`; server logs identified each resource/locale cache key and its
bounded stale age. This proves the pre-render gate does not turn a valid
last-known-good response into an outage.

The web process was then restarted while the API remained stopped, eliminating
its in-memory validated cache. The cold results were:

| Request        | Status | Language/direction | Other assertions                                               |
| -------------- | ------ | ------------------ | -------------------------------------------------------------- |
| `/en`          | `503`  | `en`, `ltr`        | English catalog message, alert, retry `60`, no internal origin |
| `/fa/projects` | `503`  | `fa`, `rtl`        | Persian catalog message, alert, retry `60`, no internal origin |
| `/en/unknown`  | `404`  | `en`, `ltr`        | No outage alert or retry header                                |
| `/`            | `308`  | —                  | One-hop redirect to `/en`                                      |

All temporary API/web processes were stopped after the run. The PostgreSQL and
MinIO proof containers were left unchanged.

## Remaining scope

This closes HTTP `503` behavior for the current home, project-list, and
project-detail surfaces plus their shared appearance/site shell. Articles do
not exist yet; their shorter stale windows, `404` no-fallback rule, publication
invalidation, and route-level outage proof remain part of the article slice.
