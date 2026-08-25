# M4 public article slice

> Historical evidence only: the Git-backed article architecture documented below was superseded by ADR-015 on 2026-08-25. Preserve this record for audit history; it does not describe the active article storage design.

Date: **2026-08-14**  
Scope: strict published article reads, bilingual routes, bounded outage behavior,
and article-specific metadata

## Delivered boundary

The public article read path now spans the shared contracts, NestJS API, typed
Next.js server client, route-availability gate, and localized reading surface:

- strict list/detail DTOs expose only public article fields, sanitized rendered
  HTML, a bounded heading index, and actually published alternate slugs;
- `GET /api/v1/public/:locale/blog/posts` uses stable cursor pagination and
  discovers only published, `SYNCED`, non-archived translations with a complete
  render cache for the current renderer;
- `GET /api/v1/public/:locale/blog/posts/:slug` never falls back across
  locales. Draft, archived, absent, and unpublished translations return the
  stable `TRANSLATION_NOT_FOUND` shape with only published alternates;
- detail reads refuse an incomplete render or a cache whose renderer version or
  Git blob SHA provenance is invalid. Raw Markdown, blob SHAs, sync state,
  versions, archive fields, and draft bodies never enter a public DTO;
- both endpoints emit locale, ETag/`304`, last-modified, and shared-cache
  headers;
- the typed web clients isolate list cursor, locale, resource, and detail slug
  cache keys, validate every response, and permit only a previously validated
  article DTO within the 15-minute ADR-014 ceiling;
- `/[locale]/blog` and `/[locale]/blog/[slug]` render server-side in English
  and Persian. The explicit legacy source returns an honest empty blog and does
  not consult the API;
- the pre-stream route gate now covers article list/detail dependencies. A
  detail `404` remains a `404`; cold or expired dependency failure becomes the
  same localized HTTP `503` used by the established public routes;
- the article page inserts pre-sanitized HTML at one reviewed boundary, emits a
  nonce-bearing escaped `BlogPosting` JSON-LD script, and derives canonical,
  Open Graph, Twitter, and published-only reciprocal `hreflang` metadata from
  the same DTO;
- article detail hides the generic same-slug locale switch. Its visible locale
  links and not-found suggestions use only API-confirmed published alternate
  slugs, preventing dead links and body fallback;
- the public footer links to the localized blog listing, so indexable articles
  have a human navigation path rather than relying on a sitemap.

## Automated verification

The article-specific suites cover:

- strict contracts, canonical English/Persian slugs, maximum lengths, and
  rejection of internal fields;
- published/`SYNCED` discovery predicates, stable cursors, current-render
  provenance, draft/absent no-fallback behavior, published-only alternates,
  endpoint validation, `304`, and bounded error disclosure;
- exact list/detail URLs, cache namespace isolation, strict `404` mapping,
  malformed-error failure, and the 15-minute last-known-good boundary;
- database/legacy source selection, route classification and dependency scope,
  article `404` versus outage behavior, bilingual route helpers, and catalog
  parity;
- reciprocal published-only article metadata, English-only `x-default`,
  absolute JSON-LD canonical URLs, dates/language fields, and `<` escaping.

Repository verification at this checkpoint:

- **505 tests passed across 51 files** in all nine tested apps/packages;
- all nine TypeScript checks passed;
- full API and web ESLint checks passed with no warnings;
- affected files passed Prettier and `git diff --check`;
- all seven workspace library emits, the API build, and the Next.js 16.3.0
  production build passed;
- the production build emitted dynamic `/[locale]/blog` and
  `/[locale]/blog/[slug]` routes and the request proxy.

## Evidence boundary and remaining work

This record deliberately does **not** claim a live database-backed article
route or end-to-end publication-invalidation proof. The current disposable
database contains no post/index rows, and the protected content-branch worker
that must create those rows is still an open M3 gate. A fabricated permanent
article was not added to hide that dependency.

M4 therefore remains in progress. It still needs:

- signed, replay-protected, locale-scoped publication invalidation wired from a
  committed mutation/sync transaction through the outbox to the rendered route;
- a real bilingual direct-push article reconciled by M3 and exercised through
  healthy, missing-translation, non-`SYNCED`, warm-outage, and cold-outage HTTP
  runs;
- complete discovery surfaces shared with M8, including sitemap/feed parity,
  social/cover-image metadata, pagination, and slug redirects.
