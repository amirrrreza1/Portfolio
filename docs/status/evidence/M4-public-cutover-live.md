# Public bilingual cutover — live run

Date: **2026-08-26**  
Milestone: [M4](../M4.md)

The run that closes M4's remaining gate lines. It is the first time the whole
public path has been exercised as one system: PostgreSQL, the article
repository, the invalidation outbox, the signed worker, the API, and a
production Next.js build, all as real processes over real sockets.

## What was run

| Component    | What it actually was                                                                                                          |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Database     | PostgreSQL 16.13 server, migrated from zero, seeded, holding M3's bilingual article                                           |
| API          | `apps/api` on Nest/Fastify, the shipped `main.ts`, no stubbed providers                                                       |
| Web          | `next build` output served by `node .next/standalone/apps/web/server.js` — the documented production server, not `next start` |
| Invalidation | the real `createSignedInvalidationSender` and `runInvalidationDrain`, driven one pass at a time                               |
| Mail         | a local SMTP sink on `:2525`, so contact delivery is observed rather than mocked                                              |
| Measurement  | a counting HTTP proxy between the web app and the API, so upstream fan-out is counted, not assumed                            |

The assertions live in `apps/api/scripts/verify-public-cutover.ts`, committed
and re-runnable:

```bash
DATABASE_URL=... WEB_ORIGIN=... API_ORIGIN=... \
CACHE_INVALIDATION_URL=... CACHE_INVALIDATION_SECRET=... \
pnpm --filter @portfolio/api verify:cutover
```

The drain is stepped deliberately rather than left to the background worker.
The interesting assertion is a negative — the route must not change until the
purge is delivered — and a continuously running worker would make every "after"
measurement true for the wrong reason.

## Result

`ALL CHECKS PASSED — 31 checks`, plus a separately measured outage and rollback
matrix.

### 1–3. Publication, update, and withdrawal reach the rendered route

```
PASS  an unpublished article is in neither the listing nor a detail page  — listing 200, detail 404
PASS  publication reaches the rendered listing once the purge is delivered  — 1 event(s) delivered
PASS  publication reaches the rendered detail page  — HTTP 200
PASS  the detail page carries the sanitized render, not the raw source
PASS  the update reaches the rendered detail page
PASS  the update reaches the rendered listing too, not only the article
PASS  an unpublished article stops answering on its detail route  — HTTP 404
PASS  an unpublished article disappears from the rendered listing
PASS  repeated requests never resurrect the withdrawn body from a buffer  — 404, 404, 404
PASS  the API answers the withdrawn slug with a translation-not-found error  — HTTP 404
```

Each step is a real save through `createArticleStore`, a real outbox row, a real
signed HTTP delivery, and a real page fetch. The withdrawal case is the one that
matters most: an article that has been unpublished must not come back out of the
bounded last-known-good buffer, and it does not.

### 4. Public discovery excludes every non-public state

```
PASS  a draft translation appears in no listing and answers no detail route
PASS  a scheduled translation appears in no listing and answers no detail route
PASS  a archived translation appears in no listing and answers no detail route
PASS  a source-integrity-invalid article leaves public discovery entirely  — detail HTTP 404
PASS  an English slug requested under Persian is a 404, never an English body
PASS  the Persian listing never contains an English-only article
```

### 5. Locale routing and direction

```
PASS  English renders left-to-right and Persian right-to-left
PASS  server-rendered navigation is present in the initial HTML of both locales
PASS  the bare root negotiates a locale and redirects exactly once  — /en / /fa
PASS  the legacy URL /projects redirects exactly once  — 308 -> /en/projects -> 200
PASS  the legacy URL /blog redirects exactly once  — 308 -> /en/blog -> 200
PASS  the legacy URL /projects/ redirects exactly once  — 308 -> /en/projects -> 200
PASS  the legacy URL /blog/ redirects exactly once  — 308 -> /en/blog -> 200
PASS  the legacy URL /en/blog/ redirects exactly once  — 308 -> /en/blog -> 200
PASS  the Persian article from M3 renders through the Persian route  — HTTP 200
```

"Exactly once" is checked by following the redirect and asserting the target is
not itself a redirect. The trailing-slash forms are checked because they are
where the gate was actually failing — see below.

### 6. Contact submission

```
PASS  a well-formed submission is accepted with no credential in the request  — HTTP 202
PASS  a honeypot submission is acknowledged identically, so bots learn nothing  — HTTP 202
PASS  an invalid submission is refused by the shared contract  — HTTP 400
PASS  the honeypot and the invalid submission persisted nothing
```

The SMTP sink received exactly one message, and its row reached
`deliveryStatus = SENT`. No browser credential exists anywhere in the path.

### Outage and rollback, measured with the API stopped

| Condition                                         | `/en` | `/fa` | `/en/blog` | detail | `/en/projects` |
| ------------------------------------------------- | ----- | ----- | ---------- | ------ | -------------- |
| Healthy                                           | `200` | `200` | `200`      | `200`  | `200`          |
| API killed, warm process (last-known-good)        | `200` | `200` | `200`      | —      | —              |
| API down, cold process                            | `503` | `503` | `503`      | `503`  | `503`          |
| API down, explicit `PORTFOLIO_DATA_SOURCE=legacy` | `200` | `200` | `200`      | —      | `200`          |
| API restored, same cold process                   | `200` | `200` | `200`      | —      | —              |

The warm process kept serving real content — the M3 article title was still in
the HTML — which is ADR-014's bounded stale window doing its job. The cold
`503` document is localized and disclosive of nothing:

```
<!doctype html><html lang="fa" dir="rtl"> … <meta name="robots" content="noindex,nofollow">
retry-after: 60
cache-control: private, no-store
x-content-type-options: nosniff
```

No API origin, no cause, no stack. Explicit legacy rollback renders every route
with the API unreachable, and the legacy blog is an honest empty list rather
than an error.

## What the run found

**One corrupted row took down blog discovery for the entire locale.**
`assertSourceIntegrity` _threw_ on a published translation whose stored digest
did not match its source, and `list()` called it inside its `map`. One bad row
therefore produced `500 Internal Server Error` for `/api/v1/public/:locale/blog/posts`
— every article in that locale gone, and an unauthenticated caller told that
something was wrong with the data. The detail path did the same, and so did the
separate "invalid render index" check for a stale renderer version or a missing
excerpt, reading time, or render.

Fixed by turning the assertion into a predicate. A faulty row is now excluded
from the listing and answered as `TRANSLATION_NOT_FOUND` on the detail path,
with the reason written to the server log and never to a response — an operator
needs to know a row went dark, a visitor must not be able to tell a corrupted
article from one that was never written. The listing filter runs _after_ the
page is sliced, so dropping a row shortens a page without skipping the next one.
`apps/api/test/public-articles.spec.ts` now covers seven fault shapes on the
detail path and asserts that one corrupted row among several leaves the rest of
the listing intact.

**Two of the legacy URLs redirected twice, not once.** `/projects/` went
`/projects/` → `/projects` → `/en/projects`, and `/blog/` did the same.
`legacyLocaleRedirect` has handled the trailing-slash forms since it was
written, but Next normalizes a trailing slash _before_ middleware runs, so
those branches were unreachable and the exit gate's "exactly once" was quietly
false for two of the five legacy URLs.

Fixed by setting `skipTrailingSlashRedirect` and moving normalization into the
proxy, where the slash and the locale prefix are resolved in the same hop. The
proxy now also canonicalizes `/en/blog/` to `/en/blog` itself, so no
locale-prefixed route lost its canonical form in the trade.
`apps/web/test/routing.spec.ts` covers both cases, and the live run measures all
five legacy URLs by following each redirect once and asserting the target is
terminal.

**A freshly provisioned database could not serve its own site.** The
deterministic seed put the About section's `location` and `role` in the section's
base content, but the public site DTO reads them from the English translation —
which is where `PageSections.json` puts them and where the M2 migration writes
them. Nothing read the seeded values, the About section failed strict
validation, `GET /api/v1/public/:locale/site` returned `500`, and every
locale-prefixed route answered `503`. So `migrate + seed` on a clean database
produced a site that could not boot, which is exactly what M1's seed exists to
prevent; it only stayed hidden because every environment so far had also run the
M2 legacy migration on top. The seed now writes them where they are read, and
Persian deliberately omits them so the run also exercises ADR-005's
fall-back-to-English rule.

**The signed invalidation pipeline currently purges nothing.** This one is a
finding, not a fix, and it is the reason §7 of the run reports rather than
asserts. With a counting proxy between the web app and the API:

- a repeat load of `/en/blog` produced **5 upstream API requests** — appearance
  and site twice each (once for the pre-stream availability gate, once for the
  page) plus the article listing;
- a title changed directly in PostgreSQL appeared in the rendered HTML on the
  very next request, with **no purge delivered**.

So Next's Data Cache is holding no public read in a production build: every
visitor request fans out to the API, and every `revalidateTag` call clears
something that was never going to be reused. The bounded last-known-good buffer
is a separate in-process map and is unaffected — which is why the outage matrix
above still behaves exactly as specified.

Two things were tried and neither changed the measurement: serving from the
documented standalone server instead of `next start` (which Next warns is
unsupported with `output: standalone`), and adding `cache: "force-cache"` to the
public read. That change was reverted rather than committed, because shipping a
confident comment about a fix that does not work is worse than shipping nothing.

**The mechanism was not established, so no fix is proposed here.** The likely
cause is Next 16's move to explicit caching, where a shared read has to live
inside a `use cache` scope rather than relying on `next.revalidate` — and that
is an architecture change that touches ADR-009's dynamic per-visitor appearance
shell. It belongs in an ADR and a scoped slice, not in a proof run. Recorded as
an open item on [M4](../M4.md) and in the roadmap's risk register.

## What this does not prove

- **No shared cache was exercised**, per the finding above. The invalidation
  path is proven correct end to end — signed, delivered, accepted, and acted on
  — but its effect on a warm shared cache is currently unobservable because
  there is no warm shared cache.
- **No MinIO.** Document and image routes were not exercised; the resume,
  certificate, and project-image boundaries rest on their existing M4 evidence.
- **No browser.** Every assertion is on HTTP status, headers, and served HTML.
  Client-side behaviour is covered by the M5 Playwright matrix instead.
- **Discovery surfaces are out of scope by design.** Sitemap, feed, social
  images, and pagination parity are M8's, as the roadmap's M4 deliverables say.
- **PostgreSQL 16.13, not 17**, and migrations were applied with `psql` because
  the Prisma engine host is unreachable from this sandbox. Both caveats are
  recorded in [M3-postgres-native-live.md](M3-postgres-native-live.md).
- **Single process, single replica.** Nonce storage and the last-known-good
  buffer are per process by design; nothing here says how they behave at two.
