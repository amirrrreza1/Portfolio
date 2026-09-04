# Project roadmap

Status snapshot: **2026-09-04**

Active milestone: **M9**. M1–M8 are complete. M8 closed on 2026-09-04 against a running stack and a real browser: the whole article lifecycle — authenticated authoring, the editor, deterministic Markdown import, revision restore, the discovery and SEO surfaces, and the scheduled-publication matrix — is live-proven in [`status/evidence/M8-discovery-live.md`](status/evidence/M8-discovery-live.md). M0 remains blocked on one owner action at the EmailJS provider and blocks nothing downstream.

Target: **production-ready bilingual portfolio, blog, and owner-admin platform**

This roadmap is the status and sequencing layer for the project. [PRODUCT_SPEC.md](PRODUCT_SPEC.md) defines the required product, and [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) contains the detailed task order. A milestone is complete only when its exit gate is demonstrated; merging its last planned feature is not enough.

Calendar dates are intentionally not assigned yet. They depend on delivery capacity and on closing each infrastructure decision before its dependent milestone. Relative sizes in this document compare milestones with each other; they are not commitments.

## 1. Product outcome

The first production release provides:

- a server-rendered portfolio backed by PostgreSQL and editable through the admin panel;
- an English and Persian blog whose canonical Markdown bodies, publication state, and revisions live in PostgreSQL;
- equivalent authenticated-editor and Markdown-import authoring paths through one safe render pipeline;
- site-wide visitor theme selection and blog-only font family and text-size selection;
- secure owner authentication, revisions, audit history, media/resume management, and recovery;
- locale-correct SEO surfaces, reproducible containers, CI security gates, backups, and a proven restore path.

The v1 non-goals in [PRODUCT_SPEC.md](PRODUCT_SPEC.md) §9 remain out of scope. In particular, v1 does not include public accounts, comments, newsletters, real-time collaboration, automatic translation, runtime MDX, or arbitrary uploaded fonts/CSS.

## 2. Current position

Phase 0 stabilization is complete in the repository, and M1 is complete. Its migrations and supplemental constraints applied from zero to PostgreSQL 17, consecutive deterministic seed runs produced stable counts, browser/server package boundaries are enforced, and API startup configuration is validated. One M0 item — revoking the published EmailJS keys at the provider — is an owner action outside the repository and holds that gate open; it blocks nothing else.

M4 and M5 were deliberately pulled forward without waiting for M2/M3 to close because the root layout, locale shell, and colour usage are touched by every later surface. M3, M4, M5, M6, M7 and M8 are now all complete. M3 closed on 2026-08-26: ADR-015's article authority is proven against a real PostgreSQL server, and a bilingual English/Persian article is published in the database. M4 closed on 2026-08-26 once M3's live article was rendered through the public route and publication, update, and withdrawal were each proven to reach it.

| Area                         | Current state                                                                                                                                                                                                                                                                                                                                                        | Roadmap implication                                                                                                                                                                                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace and specifications | pnpm monorepo, package boundaries, lockfile, environment template, and normative specifications exist                                                                                                                                                                                                                                                                | Preserve these boundaries; update specs and ADRs with each superseding decision                                                                                                                                                                                 |
| Public application           | Existing portfolio routes plus `/[locale]/blog` and locale-specific article detail render server-side with correct `lang`/`dir`; article `404` never falls back, article `503` uses a 15-minute validated ceiling, and published-only canonical/hreflang/JSON-LD metadata is implemented. Earlier portfolio/root/catalog/GitHub boundaries remain production-proven. | Complete. The discovery surfaces — category and tag pages, cursor pagination, per-locale RSS and sitemaps behind a sitemap index, `robots.txt`, resolved and generated social images — closed with M8 on 2026-09-04 against a running stack and a real browser. |
| API                          | NestJS/Fastify exposes health/contact plus strict public project, site, appearance, home, and cursor-paginated article list/detail endpoints with ETag/conditional-cache behavior. Article discovery is published and integrity-valid only; detail requires current render provenance.                                                                               | The PostgreSQL-native article repository and invalidation outbox are delivered and proven; exposing them needs the M6 auth/admin boundary                                                                                                                       |
| Contracts                    | `packages/contracts` exports strict portfolio and public article DTOs, including canonical locale slugs, sanitized render payloads, headings, published alternates, cursor envelopes, and bounded translation-missing errors; tests reject internal fields and cross-locale shapes.                                                                                  | Public read shapes are delivered; admin command DTOs remain M7/M8 work                                                                                                                                                                                          |
| Database                     | `packages/database` has a 41-model/19-enum Prisma schema, three schema migrations, separately ledgered content, page-section, and GitHub-statistics settings migrations, supplemental constraints, a pooled client, concurrency helpers, and deterministic seed                                                                                                      | M1/M2 apply/replay passed; content, media, exact Hero/About, private age, ordering, rollback, the GitHub repository allowlist, and the three reviewed colour replacements are proven.                                                                           |
| Markdown and article content | ADR-015 is implemented and proven: the forward migration is applied, PostgreSQL holds authoritative bilingual Markdown with SHA-256 source integrity and render provenance, saves are transactional with immutable revisions and stale-version rejection, and scheduled publication is idempotent and network-free.                                                  | Complete. M8 builds the authenticated editor, import/export, and publishing UX on this foundation.                                                                                                                                                              |
| Blog and admin               | Public bilingual blog list/detail routes now exist over strict API DTOs; the authenticated `/auth` boundary is delivered and live-proven, but no admin route or shell sits behind it yet.                                                                                                                                                                            | Real article content and end-to-end invalidation are proven, as are passkey verification and authorization. The admin shell and the recovery drill remain.                                                                                                      |
| Appearance                   | The root layout resolves `portfolio_prefs` against a strict locale-scoped database/legacy owner allowlist and emits the result in the first byte; the dialog consumes that allowlist, and live database/rollback plus localized HTTP `503` outage proof exists                                                                                                       | Complete. The §3 token vocabulary, the AA contrast matrix, `unicode-range`-scoped fonts, route-scoped preload, and the full §9 browser matrix are evidenced; binary font subsetting is deliberately deferred to M9                                              |
| Operations and quality       | CI runs frozen install, format, lint, typecheck, real tests, builds, and full-history secret scanning; `--passWithNoTests` is gone from every package                                                                                                                                                                                                                | Expand continuously; container, audit, SBOM, and image scanning complete in M9                                                                                                                                                                                  |
| Legacy baseline              | [BASELINE_M0.md](BASELINE_M0.md) records the routes, content counts, and SHA-256 hashes of all 137 legacy source and asset files at the pre-stabilization commit                                                                                                                                                                                                     | Frozen. It is the comparison input for the M2 reconciliation and must not be regenerated                                                                                                                                                                        |

Findings from the verification passes that carry forward:

- `prettier --check` failed on 48 files before M0, so the CI format step could not have passed on any commit. The repository is now formatted, and `.gitattributes` pins LF endings — the CRLF drift in a Windows checkout was both the cause of that failure and the reason `git diff` reported every line of 86 files as changed.
- The legacy content reconciles against the figures already stated in the plan: 14 projects, 6 skill categories, 26 skills, 5 certificates, 35 quotes, and no orphan skill references. M2 inherits a clean starting point plus a test that keeps it that way.
- **Three** skill colours are `#000000`, not two: `Next.js (App Router)` (202), `shad CN` (306), and `Vercel` (801). The migration preflight reports all three; earlier revisions of this roadmap, the plan, and the inventory said two. The source-preserving proof applied them unchanged; the owner picks accessible replacements before M2's final accepted migration version.
- M4 now has route-helper and locale/resource-isolation coverage plus live projects, site-shell/section, appearance, homepage, private-document, rollback, root-negotiation, catalog, equivalent-page switching, server-side GitHub statistics, and real HTTP `503` outage proof. The article contract/API/client/routes/no-fallback/SEO/outage boundary is automated-verification complete. M3 has now supplied the live bilingual article those reads need; signed publication invalidation through the rendered route, full discovery/social-image behavior, and milestone-wide cross-locale HTTP evidence remain. M5's [THEMING.md](THEMING.md) §9 matrix is complete as of 2026-08-24: the contrast half runs in the contracts suite, and the rest runs in a browser as its own CI job.

The root quality commands now prepare generated workspace-package artifacts themselves. The current workspace has 505 passing tests across 51 files in all nine tested apps/packages; every workspace typecheck, declared API/full web lint, all seven library emits, the API build, and the Next.js production build pass. The Windows build-path defect was traced to `outputFileTracingRoot` using a URL pathname rather than a native path; it now uses `fileURLToPath` so standalone tracing remains inside the intended workspace. This run used the installed binaries directly because pnpm's non-interactive dependency-store guard stopped the root wrapper before its scripts; M0's clean-checkout gate therefore remains separate and open.

## 3. Decisions that gate implementation

Each decision below requires an ADR or an explicit amendment to an existing ADR before the dependent implementation begins.

| Decision                                                                                           | Must be closed by                                                                                 | Why it blocks work                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-visitor appearance delivery                                                                    | **Accepted: ADR-009**; prove in M4/M5                                                             | Dynamic HTML shell emits cookie-specific attributes while public data/render caches stay shared and appearance-free                                                                                                                   |
| Persian slug policy                                                                                | **Accepted: ADR-010**; implement in M1                                                            | Unicode Persian is canonical; normalized ASCII transliterations may be redirect aliases                                                                                                                                               |
| Article storage and publication authority                                                          | **Accepted: ADR-015**; prove in M3                                                                | PostgreSQL owns complete Markdown articles, publication state, source/render integrity, immutable revisions, and transactional invalidation                                                                                           |
| Transactional article save and invalidation recovery                                               | **Accepted: ADR-015**; prove in M3/M4                                                             | One PostgreSQL transaction for article, revision, and outbox; bounded idempotent signed delivery                                                                                                                                      |
| MinIO deployment and verified ingestion boundary                                                   | Before M2                                                                                         | Certificate/resume migration and later admin media depend on stable media IDs and checksums                                                                                                                                           |
| Public API outage strategy                                                                         | **Accepted: ADR-014**; prove in M4                                                                | Bounded last-known-good published DTOs with per-surface maximum stale windows; cold/expired routes fail with controlled `503`                                                                                                         |
| Scheduler and publication-worker topology                                                          | **Accepted: ADR-013/015**; prove in M3/M8                                                         | Dedicated PostgreSQL-backed publication/invalidation worker and advisory-lock scheduler; API replicas run no timers                                                                                                                   |
| Hosting/reverse proxy, monitoring, retention defaults, analytics choice, and v1 editor permissions | Deadlines assigned in `DECISIONS.md`; **the hosting and editor-permission deadlines are overdue** | These choices affect adapters, privacy, authorization, runbooks, and final deployment. M4 and M6 opened without them; see the note under the deadline table in [DECISIONS.md](DECISIONS.md#decision-deadlines-for-remaining-adapters) |

## 4. Delivery map

```mermaid
flowchart LR
    M0["M0 Baseline and decisions"] --> M1["M1 Domain and media foundation"]
    M1 --> M2["M2 Deterministic migration"]
    M2 --> M3["M3 PostgreSQL articles"]
    M3 --> M4["M4 Public bilingual cutover"]
    M4 --> M5["M5 Appearance and accessibility"]
    M1 --> M6["M6 Authentication foundation"]
    M2 --> M7["M7 Portfolio CMS"]
    M3 --> M7
    M4 --> M7
    M5 --> M7
    M6 --> M7
    M7 --> M8["M8 Blog and SEO"]
    M5 --> M9["M9 Operations and launch"]
    M8 --> M9
```

M6 may run alongside M2–M5 once M1 is stable. M7 API/domain work may begin after M2 and M6, but its UI uses the M5 design-system boundary, its publication-health slice needs M3, and its end-to-end invalidation gate needs M4. For a single developer, follow the numbered order unless switching tracks removes a genuine external blocker.

Two dependencies are non-negotiable:

1. The Markdown parser, sanitizer, and security corpus pass before the article repository accepts content.
2. The PostgreSQL-native article foundation is proven before blog authoring and lifecycle UI are built on it.

## 5. Milestone summary

| Milestone                                 | Status      | Relative size | Outcome                                                                                                              | Depends on         |
| ----------------------------------------- | ----------- | ------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------ |
| M0 — Baseline, guardrails, and decisions  | Blocked     | S             | Verified scaffold, urgent risk cleanup, starter CI, and closed architectural blockers                                | —                  |
| M1 — Trusted domain and media foundation  | Complete    | XL            | Shared contracts, Prisma schema/migrations, safe Markdown pipeline, and verified media identity/ingestion primitives | M0                 |
| M2 — Deterministic legacy migration       | Complete    | M             | Repeatable legacy portfolio/media migration with reconciliation and rollback                                         | M1                 |
| M3 — PostgreSQL-native article foundation | Complete    | L             | Transactional Markdown persistence, revisions, source integrity, publication jobs, and cache outbox                  | M1, M2             |
| M4 — Public bilingual cutover             | Complete    | XL            | Published-only API reads become the default, with locale routing, SSR navigation, and an isolated rollback adapter   | M2, M3             |
| M5 — Appearance and accessibility         | Complete    | M             | Flash-free site theme, blog-only typography, reduced motion, and tokenized colours                                   | M4                 |
| M6 — Authentication foundation            | Complete    | L             | Owner provisioning, passkeys, sessions, CSRF, authorization, and audit baseline                                      | M1                 |
| M7 — Portfolio CMS                        | Complete    | XL            | Every non-blog portfolio field, translation, media item, and resume manageable through admin                         | M2, M3, M4, M5, M6 |
| M8 — Blog authoring, publishing, and SEO  | Complete    | XL            | Editor/import/export parity, lifecycle and scheduling, discovery, and locale SEO                                     | M3, M4, M6, M7     |
| M9 — Operations, release, and cleanup     | Not started | L             | Operational contact/media controls, reproducible deployment, restore drill, launch, and rollback-window cleanup      | M5, M8             |

M0 is `Blocked` rather than `In progress`: every repository-owned deliverable is merged, and the only outstanding exit condition — revoking the EmailJS keys at the provider — cannot be done from the repository. It blocks nothing downstream, so work continues in parallel.

M4 was opened before its M3 dependency exited. That was a real ordering exception, not a re-plan: the shell work was pulled forward because it is cheaper before more UI exists, and the parts of M4 that genuinely needed a proven PostgreSQL-native article foundation — real article reads and end-to-end invalidation — were exactly the parts left until last. Both milestones closed on 2026-08-26, in that order, so the exception is discharged. M9 is the only milestone open besides M0.

The detailed plan maps to these milestones as follows: M0 pulls forward the Phase 0 cleanup and starter CI; M1 is Phase 1 plus the media foundation needed by migration; M2 is Phase 2; M3 is Phase 2.5; M4 is Phase 3 plus the public contact replacement; M5 is Phase 3.5; M6 is Phase 4; M7 is Phase 5 plus upload hardening; M8 is Phase 6; and M9 completes Phases 7–9. This mapping is authoritative when the older phase grouping would defer a prerequisite until after its consumer.

## 6. Milestones and exit gates

### M0 — Baseline, guardrails, and decisions

Objective: make the scaffold reproducible and remove immediate risks before domain code compounds them.

Deliverables:

- run frozen install, format check, lint, typecheck, tests, and production builds from a clean checkout;
- add a minimal CI workflow and at least one real smoke test; remove `--passWithNoTests` package by package as real suites land;
- capture the original legacy routes, source hashes, content counts, and screenshots before correcting any source path or removing any font file;
- set `metadataBase` and standalone output, use Zod as the single API validation stack, declare or move the birthday value server-side, correct certificate path casing, and reduce unused font formats after verifying the active faces;
- revoke and rotate the already-published EmailJS credentials at the provider immediately; in the same change, remove/disable the client integration and show an honest temporary unavailable state until M4 supplies the server contact path;
- close the decisions needed by M1–M3, assign a decision deadline before each later dependent milestone, and update the affected specifications.

Exit gate:

| Condition                                                                          | Status                         | Evidence                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The existing web and API builds pass from a clean checkout                         | **Outstanding**                | Formatting, JSON/YAML validity, asset resolution, and the age logic were verified directly, and no type or syntax errors were found in the changed files. The pinned toolchain has not yet been exercised end to end; run `pnpm install --frozen-lockfile && pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build` on Node 24.13 / pnpm 11.9 to close this |
| Starter CI blocks a broken build and does not report a false green from zero tests | **Met**                        | `.github/workflows/ci.yml` runs format, lint, typecheck, tests, and builds; `--passWithNoTests` is removed from every package and `apps/web` has real suites                                                                                                                                                                                                                      |
| Exposed EmailJS credentials are confirmed revoked                                  | **Outstanding — owner action** | The M4 contact change removed the browser integration: no `NEXT_PUBLIC_EMAILJS_*` reference remains anywhere in the workspace, and submissions now go server-side. That fixes future builds and nothing else. Every bundle already served carries the keys, so anyone who kept a copy can still send mail through the account until it is rotated at the provider                 |
| Every decision needed by M1–M3 has an accepted ADR and named follow-up milestone   | **Met**                        | ADR-003 through ADR-014 in [DECISIONS.md](DECISIONS.md), each with its proving milestone recorded in §3                                                                                                                                                                                                                                                                           |

Two guardrails were added beyond the original deliverables, because the first exit condition could not otherwise be met:

- the repository is formatted and `prettier --check` passes; it failed on 48 files beforehand, which would have made the CI format step red on every commit;
- `.gitattributes` pins LF line endings, removing the CRLF drift that caused formatting to behave differently in a Windows checkout than in CI.

### M1 — Trusted domain and media foundation

Objective: build the validated domain and media trust layer every later write, migration, and render path depends on.

Deliverables:

- shared Zod contracts for IDs, locales, errors, pagination, auth, content, appearance, and blog commands;
- Prisma schema, reviewed migrations, generated client wrapper, transaction helpers, test database, and deterministic seed;
- startup validation for all runtime configuration and secrets;
- `packages/markdown` with frontmatter parsing, deterministic serialization, restricted directives, sanitization, heading extraction, Shiki output, and restricted inline Markdown for portfolio prose;
- the chosen MinIO adapter with verified MIME detection, hashing, stable media IDs, safe names, and a local/test implementation for migration;
- security corpora for XSS, unsafe links, YAML abuse, path traversal, unknown directives, and malformed input;
- CI checks for contracts, migration validation, renderer tests, dependency/secret scanning, lint, typecheck, and builds.

Slice status:

| Slice                                             | Status                    | Notes                                                                                                                                                                                                                                                             |
| ------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contracts — common and appearance                 | **Delivered**             | `packages/contracts`: branded IDs, locale allowlist, ADR-010 slug normalization, scalar value objects, cursor pagination, the error contract, the appearance registry, and the `portfolio_prefs` cookie with allowlist resolution                                 |
| Database — schema and constraints                 | **Delivered and applied** | `packages/database`: 41 models, 19 enums, 64 relation fields, 52 `CHECK` constraints and 6 partial indexes, pooled client, optimistic-concurrency and advisory-lock helpers, deterministic seed, and two migrations applied from zero to PostgreSQL 17            |
| Contracts — auth, content, contact, blog commands | **Delivered**             | Password policy, login, WebAuthn, sessions and CSRF; the contact submission schema the API and the form now share; the frontmatter contract every authoring path shares; article source-integrity/version contracts; and lifecycle commands. Nine suites in total |
| Markdown pipeline                                 | **Delivered**             | packages/markdown now provides bounded safe YAML/frontmatter parsing, byte-stable serialization, GFM/directive validation, server-only Shiki output, sanitize-last rendering, heading/reading-time derivation, and an XSS/YAML/URL corpus                         |
| Media foundation                                  | **Delivered**             | packages/media provides private S3/MinIO and local/test object-store adapters, magic-byte MIME verification, SHA-256 identity, safe public names, and traversal-proof object-key handling                                                                         |

Exit gate:

| Condition                                                                   | Status  | Evidence                                                                                                                                                                       |
| --------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A clean database migrates from zero and seeds deterministically             | **Met** | PostgreSQL 17 applied `20260814143856_init` and `20260814143905_integrity_constraints` from an empty database; two consecutive seed runs produced the same asserted row counts |
| Frontmatter round-trips without semantic drift                              | **Met** | The Markdown suite proves byte-stable serialize → parse → serialize output                                                                                                     |
| The renderer and all security corpora pass                                  | **Met** | The Markdown suite covers raw HTML/XSS, unsafe URLs, unknown/malformed directives, YAML aliases/duplicate keys, H1 rejection, heading uniqueness, and unknown code languages   |
| Public/browser packages cannot import the database client or server secrets | **Met** | Enforced for shared contracts by `packages/contracts/test/boundaries.spec.ts` and for the web package/client graph by `apps/web/test/server-boundary.spec.ts`                  |

The constraint suite (`packages/database/test/constraints.spec.ts`) proves each `CHECK` and partial index rejects what it claims to, using PostgreSQL compiled to WebAssembly rather than a database server, so it runs in CI today. Two constraints failed their own tests when first written: SQL's three-valued logic means a `CHECK` evaluating to NULL passes, which silently permitted a half-populated image dimension pair and an empty appearance allowlist.

### M2 — Deterministic legacy migration

Objective: move legacy portfolio data without losing fidelity, using the media primitives proven in M1.

Current slice: **real apply and idempotency proof delivered.** The migration
package loads the preserved JSON snapshot, validates it before any write,
normalizes only reviewed values, and emits a deterministic report. PostgreSQL
17 and a private MinIO bucket accepted the first explicit apply: all target
counts reconciled, six PDF objects matched source/database byte sizes and
SHA-256 hashes, and the ledger recorded the exact source checksum. An immediate
replay skipped before writing any object. The current snapshot has zero errors
and four explained warnings: the Portfolio placeholder URL becomes null, and
the three black skill colours name the reviewed replacement that
`2026-08-15.skill-colors.1` applies to each of them.
The applied evidence is recorded in
[`docs/status/evidence/M2-run.md`](status/evidence/M2-run.md).

The fourth deliverable is now proven for projects, skills, certificates,
quotes, the active resume, the site shell, and appearance.
`PORTFOLIO_DATA_SOURCE` selects either the typed database client or the isolated
legacy adapter. Projects and localized navigation/footer rendered from the
legacy source while the configured API origin was deliberately unreachable;
distinct link and document-path sets also proved which source supplied the
page. Private MinIO reads reproduced all five certificates and the active
resume byte-for-byte. A separately ledgered page-section migration now
preserves the exact Hero/About source as restricted inline Markdown, moves the
private birth date into `SiteSettings`, and restores the six-section render
plan. Live database and API-independent rollback renders matched
text/emphasis/order, and a temporary disable removed one section from both API
and HTML before it was restored. The three colour choices were made on 2026-08-15 and are
implemented as a separately ledgered migration that checks each replacement
against every theme background and against its own derived label before
writing; the frozen source keeps its `#000000` values. Only the applied run of
that migration against the real database remains before M2 can close. The runs are
recorded in [`docs/status/evidence/M4-projects-read.md`](status/evidence/M4-projects-read.md),
[`docs/status/evidence/M4-site-read.md`](status/evidence/M4-site-read.md), and
[`docs/status/evidence/M4-home-read.md`](status/evidence/M4-home-read.md), and
[`docs/status/evidence/M4-page-sections.md`](status/evidence/M4-page-sections.md).

Deliverables:

- implement a versioned, idempotent migration command for JSON, hard-coded fields, resume, certificate PDFs, and public assets;
- seed English translations, preserve legacy IDs, normalize approved enums/URLs/dates, and generate collision reports rather than silently coercing;
- emit a reconciliation report with counts, byte comparisons, checksums, orphan checks, path-case checks, and explained encoding differences;
- introduce a server-side legacy-read adapter and rollback flags before cutover, then retain them until the post-launch rollback window closes.

Exit gate:

- the counts and checksums in [CONTENT_INVENTORY.md](CONTENT_INVENTORY.md) §15 reconcile exactly;
- there are zero orphan skill references, case-mismatched paths, silent enum coercions, unsafe URLs, or unexplained warnings;
- rerunning the same migration produces no unintended changes;
- switching back to legacy reads remains possible.

### M3 — PostgreSQL-native article foundation

Objective: prove that complete bilingual Markdown articles, editorial metadata, render integrity, revisions, publication state, and cache-delivery intent have one authoritative PostgreSQL transaction boundary.

Deliverables:

- A reviewed forward migration adds authoritative translation Markdown, SHA-256 source integrity, integer draft base versions, and removes obsolete Git synchronization state/tables without rewriting historical migrations. Previously indexed rows without recoverable Markdown fail closed until explicitly reimported.
- A server-only article repository validates editorial metadata, existing taxonomy/media references, locale identity, safe Markdown, and current renderer output before writing.
- Explicit save checks the integer optimistic version and atomically persists body, render cache, translation metadata, immutable content revision, and durable invalidation outbox. Conflicts or transaction failures change nothing.
- Dedicated PostgreSQL-backed publication jobs, an advisory-lock scheduler, bounded retries, dead-letter visibility, and the existing signed cache-invalidation outbox remain available.
- GitHub App content credentials, protected-content-branch requirements, inbound content webhooks, reconciliation/drift states, sync logs, apply ledgers, and cross-system operation records are removed.
- One real English/Persian article is saved and published through the PostgreSQL-native repository; public route and end-to-end invalidation proof close in M4.

Exit gate — **met 2026-08-26**, evidence in [`status/evidence/M3-postgres-native-live.md`](status/evidence/M3-postgres-native-live.md):

- PostgreSQL contains the complete bilingual Markdown source, valid SHA-256 digests, current safe renders, editorial metadata, versions, and immutable revisions.
- A stale version or invalid body/reference changes neither the existing article nor its revision/outbox history.
- A forced transaction failure leaves source, render, revision, and invalidation state unchanged.
- Due publication is idempotent and requires neither Git access nor deployment.
- No Git content credential, webhook, synchronization model, or split-brain recovery worker remains in the active runtime.

### M4 — Public bilingual cutover

Objective: make cache-safe, locale-explicit server rendering the default public path while retaining an isolated rollback adapter.

Current slice: the locale shell exists. `/[locale]` routes validate the segment
against the contracts allowlist and `404` on anything else, middleware resolves
the locale into a request header, and both the root `<html>` and the locale
layout emit the matching `lang`/`dir`. All four legacy JSON imports are
confined to `apps/web/src/server/legacy-portfolio.ts`, so no component reads
`src/DataBase` directly. Contact submission goes to `POST /api/v1/contact`,
which validates with the shared contract and delivers over SMTP server-side;
the EmailJS client integration and every `NEXT_PUBLIC_EMAILJS_*` reference are
gone from the workspace.

The projects list is the first complete public-read vertical slice. Strict
allowlisted DTOs feed `GET /api/v1/public/:locale/projects`, whose query excludes
disabled and archived content and whose response carries `ETag`,
`Last-Modified`, `Content-Language`, and shared-cache directives. The typed web
client validates responses, bounds its timeout, revalidates conditionally, and
uses only locale-matching validated last-known-good data within ADR-014's
60-minute ceiling. `PORTFOLIO_DATA_SOURCE` switches the localized route between
that database path and the isolated legacy adapter. A live PostgreSQL/Next.js
run proved both locales and the explicit rollback path; the evidence is in
[`docs/status/evidence/M4-projects-read.md`](status/evidence/M4-projects-read.md).

The localized site shell is the second complete read boundary. Strict
key-specific section schemas and safe navigation/social-link unions feed
`GET /api/v1/public/:locale/site`; its Prisma selection excludes private
contact, retention, search-console, birth-date, version, and timestamp fields.
The generic typed client isolates resource and locale cache namespaces, while
`Header` and `Footer` now receive the selected server DTO rather than owning
hard-coded values. Live database, isolated rollback, and cold-outage runs are
recorded in [`docs/status/evidence/M4-site-read.md`](status/evidence/M4-site-read.md).

Appearance is the third complete read boundary. A strict locale-scoped DTO and
explicit Prisma projection feed `GET /api/v1/public/:locale/appearance`; the
response includes only enabled theme keys, registry-owned script-compatible
fonts, allowed size steps, defaults, and the motion-toggle flag. It carries
one-hour shared-cache directives plus `ETag`/`304` and does not vary on cookies.
The root layout now obtains this allowlist through the same typed,
locale-isolated, bounded-fallback client and database/legacy source switch
before resolving `portfolio_prefs`; the former root constant and dialog option
arrays are gone. Live database, visitor-cookie correction, isolated rollback,
and cold-outage runs are recorded in
[`docs/status/evidence/M4-appearance-read.md`](status/evidence/M4-appearance-read.md).

Homepage collections and document delivery are the fourth complete boundary.
The existing projects client now supplies homepage projects/skills, while a
strict `GET /api/v1/public/:locale/home` projection supplies a stable UTC quote,
enabled/non-archived certificates, and active-resume metadata. Opaque document
routes authorize verified database references and read the private MinIO
objects without disclosing storage topology. All six PDFs matched the frozen
legacy hashes; database, same-origin proxy, API-independent rollback, full
cold-outage, and selective home-outage runs are recorded in
[`docs/status/evidence/M4-home-read.md`](status/evidence/M4-home-read.md).

Hero/About and enabled-section orchestration now use the existing strict site
boundary and selected source. Exact database/rollback rendering, UTC age
derivation without date disclosure, restricted Markdown, ordering, and a live
disable/restore are recorded in
[`docs/status/evidence/M4-page-sections.md`](status/evidence/M4-page-sections.md).

Project detail and optional image delivery are the fifth complete boundary.
Strict per-slug DTOs, enabled/non-archived predicates, safe standalone Markdown,
ordered skills, conditional caching, stable `404`, a slug-isolated client, and
localized database/rollback pages are implemented. The opaque image route
requires a verified public project relation, verifies object length, and never
exposes storage topology. The frozen/current portfolio has no project images or
long descriptions, so live rows correctly return `null`; successful image
delivery is fixture-proven. Database, isolated rollback, conditional, disabled
row, missing-slug, and cold-outage runs are recorded in
[`docs/status/evidence/M4-project-detail.md`](status/evidence/M4-project-detail.md).

Root negotiation and the active portfolio catalogs are now complete. The bare
`/` request resolves a validated locale cookie, then quality-weighted
`Accept-Language`, then English; prefixed routes remain stable. Typed English
and Persian catalogs cover the active shell, settings, project routes,
certificates, resume, contact, outage, footer, and not-found UI, and the
language control preserves the equivalent page. Production-mode results are in
[`docs/status/evidence/M4-i18n.md`](status/evidence/M4-i18n.md).

GitHub statistics now use an allowlisted request-time server adapter. A
separately ledgered migration derived the exact 13-repository allowlist from the
frozen source, and production-mode English/Persian HTML carried current values
without a visitor-side third-party request. Fresh, stale, unavailable, and
negative-cache behavior is recorded in
[`docs/status/evidence/M4-github-stats.md`](status/evidence/M4-github-stats.md).

Current public routes now return an actual localized HTTP `503` before React
streaming when database-source data is cold or older than the allowed
last-known-good window. The route-scoped proxy gate reuses the typed client
policy, preserves healthy and in-window stale `200` pages, bypasses explicit
legacy rollback, and leaves missing projects and unknown paths as `404`.
Production-mode healthy, warm-outage, cold-outage, locale, and disclosure
results are recorded in
[`docs/status/evidence/M4-http-503.md`](status/evidence/M4-http-503.md).

The strict article public path, bilingual catalogs/routes, no-fallback behavior,
current-render checks, shorter stale boundary, and published-only metadata are
now implemented and automated-verification complete. The gate remains open for
a real PostgreSQL-native M3 bilingual article, end-to-end signed publication
invalidation, full discovery/social-image behavior, and live article HTTP proof.

Deliverables:

- published/enabled-only public DTOs and API endpoints with ETags, locale-scoped cache tags, and exclusion of every translation with incomplete source/render integrity from public discovery;
- typed server-side Next.js API client with bounded timeouts and the chosen outage behavior;
- `/[locale]/` routing, one-hop legacy `308` redirects, dynamic `lang`/`dir`, message catalogs, and bidi-safe shared components;
- server-rendered navigation, metadata/canonical foundations, and a minimal read-only route proving the seeded bilingual article; complete blog discovery surfaces remain in M8;
- section-by-section migration behind feature flags, comparing rendered output before removing each JSON import;
- server-side cached GitHub statistics and draft/cross-locale leakage tests;
- server-side SMTP contact submission with validation, layered anti-abuse controls, a generic response, and no browser/provider credential.

Exit gate — **met 2026-08-26**, evidence in [`status/evidence/M4-public-cutover-live.md`](status/evidence/M4-public-cutover-live.md):

- the active production path has no component import from `src/DataBase`; the dormant legacy adapter is reachable only through the tested server-side rollback flag;
- English and Persian routes render with correct direction; missing Persian portfolio fields deliberately fall back to English, while a missing article translation returns `404` without fallback;
- every legacy URL redirects exactly once;
- navigation is present in initial HTML and the tested outage behavior is consistent;
- public caches/listings never contain draft, preview, scheduled, archived, source-invalid, or cross-locale content;
- content publication/invalidation reaches the rendered route end to end;
- contact submission works without browser credentials and passes its baseline abuse tests.

### M5 — Appearance and accessibility

Objective: establish the final design-system boundary before UI surface area grows further.

Current slice: appearance is server-resolved against the owner's selected
source. A strict public API reads the PostgreSQL singleton with an explicit
allowlist projection, filters fonts for the requested locale's script, and
supports shared-cache `ETag`/`304` responses. The root layout reads
`portfolio_prefs`, validates it against that locale-scoped public allowlist
through `@portfolio/contracts/appearance`, and emits `data-theme` and
`data-motion` on `<html>` in the first byte. `ThemeContext` and the settings
dialog consume the same public options rather than re-deriving or hard-coding
them. Blog font and size are applied only to `.blog-reading-surface`. `system`
mode is resolved by the one reviewed nonced pre-paint script, and middleware
sets the public CSP alongside `Referrer-Policy`, `X-Content-Type-Options`,
`X-Frame-Options`, `Cross-Origin-Opener-Policy`, and `Permissions-Policy`.
Reduced motion is wired through the hero, particles, scramble text, and typing
text, and inline styles were removed from the application components. Live
database, cookie-correction, rollback, and cold-outage evidence now exists.

The theme token set was migrated to the [THEMING.md](THEMING.md) §3 vocabulary
on 2026-08-16, per theme rather than shared, and §3's "components consume
tokens only" rule now has a CI check behind it. The migration closed five WCAG
2.2 AA failures a shared-value palette had hidden, removed three `dark:`
colour switches that resolved against `prefers-color-scheme` instead of the
selected `data-theme`, and replaced every opacity-thinned text and border
variant with a measurable token. Every enabled theme passes a 26-pairing
contrast matrix.

On 2026-08-24 the remaining automated work closed. `@portfolio/markdown`
uses Shiki dual-theme output. Shiki 4 serializes light colours inline and
exposes dark alternatives as custom properties, so the stylesheet leaves light
output intact and narrowly selects dark values from the SELECTED `data-theme`
rather than from `prefers-color-scheme`; `--color-code-bg`/`--color-code-text`
paint the measured surface. The 16 JetBrains Mono faces are reduced to the six the design can
select (7 files, 283 KB, from 17 and 712 KB), every face declares a
`unicode-range`, the Latin family declares no Arabic block, and preloading is
confined to two reviewed call sites reading a static key-indexed literal. The
THEMING §9 list now has a 35-test Playwright suite running as its own CI job
against a production build.

Running the page in a browser found two defects the static suites could not.
Every Persian article route answered `404`: Next.js hands a non-ASCII `[slug]`
through percent-encoded, and the route validated it undecoded, so even the links
the blog index generates led nowhere. And `pnpm lint` was already failing on
`dev` over the `localStorage` migration's `setState`-in-effect. Both are fixed.

On 2026-08-25, the owner approved the light theme and confirmed the
screen-reader experience, closing M5. Two non-gating items remain deferred to
M9: re-encoding the font binaries for true per-script subsetting, and removing
`'unsafe-inline'` from `style-src`, which needs Shiki's per-token `style`
attributes converted to generated classes.

Deliverables:

- static theme tokens and blog-font registry; remove hard-coded component colours and add enforcement;
- cookie-backed, server-compatible theme resolution with no first-paint flash;
- `blogFont` and `blogSize` applied only to `.blog-reading-surface`, never `html`, `body`, shared chrome, portfolio pages, settings, or admin;
- accessible settings dialog for theme, blog typography, motion, and language;
- public CSP/security headers, including the reviewed nonce path for the pre-paint script;
- reduced-motion behavior across cube, particles, scramble/type effects, smooth scroll, and cursor;
- font subsetting/preload rules that do not download optional blog fonts on non-blog routes.

Exit gate:

- ~~every enabled theme passes WCAG 2.2 AA checks~~ — met 2026-08-16 for the
  declared token values; see
  [`docs/status/evidence/M5-theme-tokens.md`](status/evidence/M5-theme-tokens.md).
  The Shiki code themes are now selected between in CSS by the selected theme,
  and that is proven in a browser;
- ~~first render and hydration agree for every preference mode~~ — met
  2026-08-24;
- ~~blog typography scoping and non-blog font-download tests pass~~ — met
  2026-08-24;
- ~~public responses do not send `Vary: Cookie`, and the selected
  appearance-delivery strategy passes its shared-cache test~~ — met 2026-08-24;
- ~~public, error, and no-JavaScript responses pass CSP and security-header
  checks~~ — met 2026-08-24.

All five automated gates are met; see
[`docs/status/evidence/M5-appearance-matrix.md`](status/evidence/M5-appearance-matrix.md).
The owner completed the light-theme and screen-reader verification on
2026-08-25, so M5 is complete.

### M6 — Authentication foundation

Objective: make the admin boundary safe before any mutation UI is exposed.

Complete on 2026-08-27. All ten §5 endpoints, two-factor login with
cryptographically verified passkeys, enrolment, opaque rotating sessions, CSRF
and origin enforcement, recovery with a session sweep, progressive throttling,
deny-by-default authorization, and redacted audit events — proven against a
running system in
[`status/evidence/M6-auth-boundary-live.md`](status/evidence/M6-auth-boundary-live.md)
(24 checks). The authenticated admin shell is proven in a real browser with a
virtual authenticator in
[`status/evidence/M6-admin-shell-live.md`](status/evidence/M6-admin-shell-live.md)
(10 checks), and the owner recovery and credential-revocation drill is written
as [`runbooks/owner-recovery-and-revocation.md`](runbooks/owner-recovery-and-revocation.md)
and rehearsed in
[`status/evidence/M6-recovery-revocation-drill.md`](status/evidence/M6-recovery-revocation-drill.md)
(11 steps).

The shell carries no content mutation capability, as the gate requires;
ADMIN-003's dashboard defers to M7 with the `/admin` endpoints that would feed
it. The v1 editor-permission ADR is still owed — `EDITOR` is defined but
deliberately unassignable until it lands. That holds M7's editor story, not
this gate.

Deliverables:

- one-time owner provisioning, calibrated Argon2id login, WebAuthn enrollment/assertion, recovery codes, and throttling;
- opaque hashed sessions, secure cookies, fixation protection, rotation/revocation, session management, and recent-auth rules;
- CSRF/origin checks and deny-by-default role/object policies;
- admin/auth-specific CSP and security headers, structured redacted logs, audit events, and security notifications;
- authenticated admin shell with no content mutation capability until the gate passes.

Exit gate:

- the admin shell cannot be reached without verified credentials;
- authentication, WebAuthn replay/origin, session, CSRF, recovery, role, and object-level negative tests pass;
- an owner recovery and credential-revocation drill is documented and repeatable.

### M7 — Portfolio CMS

Objective: make all existing portfolio content manageable through tested vertical slices.

Complete on 2026-08-28. Every non-blog resource family is reachable through the
authenticated `/admin` surface with versioned writes, revisions, redacted audit
events, and durable cache invalidation in the same transaction; the admin
workspace exposes them with accessible conflict handling; media is verified by
magic bytes, re-encoded or page-checked, quarantined on refusal, and never
exposes a storage key; and resume activation is atomic. Proven against a
running stack in
[`status/evidence/M7-portfolio-cms-live.md`](status/evidence/M7-portfolio-cms-live.md)
(31 checks) and in a real browser
(`pnpm --filter @portfolio/web test:e2e:admin -- portfolio-cms`, 1 test).

The run found two defects, both recorded in that file: one unfinished record
returned `500` for a whole public collection and took the site to `503`, and
the M6 role-assignment guard was never wired to M7's user endpoints. Both are
fixed. `EDITOR` remains unassignable until the overdue v1 editor-permission
ADR lands, which holds M7's editor story, not this gate.

Deliver slices in this order:

1. site/appearance settings, page sections, navigation, and social links;
2. skills/categories and project relationships;
3. projects, certificates, and quotes;
4. media/resume upload with streaming limits, magic-byte and decode verification, safe object keys, image re-encoding, PDF policy/quarantine, reference authorization, atomic activation, and abuse tests;
5. per-locale translations and untranslated-field indicators;
6. revisions/restore, audit viewer, publication and invalidation health, sessions, and permitted user management.

Every slice includes contracts, transaction behavior, optimistic concurrency, revision/audit records, authorization, cache invalidation, accessible loading/empty/error/conflict UI, and tests.

Exit gate:

- every non-blog portfolio row in [CONTENT_INVENTORY.md](CONTENT_INVENTORY.md) maps to an editable control and persisted API operation;
- no non-blog portfolio content requires direct database or source editing;
- media/resume replacement is atomic and recoverable;
- every upload security control required by [SECURITY.md](SECURITY.md) §8 passes before media beta access;
- stale edits return a conflict and never overwrite silently;
- revision restore and audit evidence pass for every non-blog resource family.

The Owner beta checkpoint is private or access-restricted. It is not exposed to the public internet until the independent security review in M9 is complete.

### M8 — Blog authoring, publishing, and SEO

Objective: deliver one coherent article lifecycle across authenticated editing, validated upload, and PostgreSQL.

Started 2026-08-28, closed 2026-09-04. The authenticated authoring boundary is delivered and
live-proven in
[`status/evidence/M8-blog-authoring-live.md`](status/evidence/M8-blog-authoring-live.md)
(25 checks): post and taxonomy CRUD, per-locale publish/schedule/unpublish/
archive as separate commands, an evaluated publish checklist whose blockers
refuse and whose warnings must be acknowledged by name, autosave that cannot
reach publication, slug history whose redirects collapse their own chains, and
preview through the production pipeline. The editor that reaches it is proven
in a real browser in
[`status/evidence/M8-editor-live.md`](status/evidence/M8-editor-live.md):
article workspace panel, directive palette, checklist with a checkbox per
warning, autosave, and the preview route. Deterministic Markdown import is
live-proven in
[`status/evidence/M8-import-live.md`](status/evidence/M8-import-live.md): strict
UTF-8 and bounded input, executable-MDX rejection, line findings, normalized
source and exact diff, private byte-for-byte quarantine, and one-time
actor/target/version-bound confirmation through the normal article-save path.
Article revision restore is live-proven in
[`status/evidence/M8-restore-live.md`](status/evidence/M8-restore-live.md): an
earlier version is replayed from its recorded source through the same validated
save an author uses, re-rendered and re-digested by today's renderer, recorded
as a new revision on the single `POST /admin/revisions/:id/restore` endpoint,
refused when the snapshot no longer matches its digest or the translation is
archived, and unable to change publication state.

The discovery and SEO surfaces and the scheduled-publication matrix closed the
milestone on 2026-09-04, live-proven in
[`status/evidence/M8-discovery-live.md`](status/evidence/M8-discovery-live.md).
The discovery slice adds three public read models from §4 plus one addition to
that table (`/public/:locale/blog/taxonomy`, which the navigation index and the
sitemap both need in order to enumerate terms), the category and tag routes,
cursor pagination that keeps unstable cursor URLs out of the index and out of
the sitemap, per-locale RSS and sitemaps behind a sitemap index, `robots.txt`,
server-resolved social images, related content selected from declared taxonomy
alone, and collection/breadcrumb structured data — with every discovery surface
sharing one published-and-integrity-valid predicate, and one alternate list
feeding both a page's `hreflang` and its sitemap entry's `xhtml:link`. The
publication slice extracts the single-scheduler rule from the worker's process
entrypoint so it can be asserted, and proves enqueue deduplication and
retry-idempotency against real PostgreSQL.

The run recorded 56/56 live API checks, 45/45 public browser checks, the admin
editor flow, and M7's proof re-run unchanged; it found five defects, of which
two were visible only to `next build` and `eslint`, and it closed the last
SEO.md §3 gap by generating a share card for an article whose author chose no
image. It declines to generate one for Persian: the renderer lays out glyphs
without a text shaper, so an RTL card would ship disconnected letters, and a
Persian article uses the author's own image or none. That limitation and the
cursor-pagination decision are recorded in [`status/M8.md`](status/M8.md).

Deliverables:

- Markdown editor, directive palette, database-only autosave, production-pipeline preview, and optimistic integer-version conflict handling;
- `.md`/`.mdx` dry-run import, normalization report, confirmation, original-file quarantine, and rejection of executable MDX constructs;
- post/translation/taxonomy CRUD, per-locale state transitions, revisions, slug history, redirects, and transactional scheduled publishing and durable invalidation;
- locale blog index/detail/category/tag/preview pages with accessible headings and code blocks;
- dynamic metadata, canonicals, reciprocal `hreflang`, JSON-LD, per-locale RSS/sitemaps, robots, related content, and editorial checks; every discovery surface excludes translations with incomplete source/render integrity;
- single-scheduler, retry-idempotency, and transactional-rollback publication tests.

Exit gate:

- authenticated panel authoring and validated Markdown import produce identical sanitized output;
- draft → preview → scheduled/published → revised/redirected/archived works independently per locale;
- conflicts write nothing until explicitly resolved;
- scheduled publication commits exactly once and creates a durable signed invalidation;
- automated SEO, redirect, disclosure, source-integrity, and cross-locale tests pass;
- the blog portion of PRODUCT_SPEC `ADMIN-004` is complete, closing the requirement together with M7.

### M9 — Operations, release, and cleanup

Objective: prove the system can be deployed, defended, restored, observed, and rolled back.

Deliverables:

- complete contact retention, delivery-state operations, alerting, and safe admin access around the M4 server adapter;
- add media/object lifecycle and orphan cleanup, observable idempotent retries, storage monitoring, and final upload-abuse regression;
- multi-stage non-root web/API/scheduler images, Compose profiles, separate migration job, health/readiness probes, secrets, and least-privilege runtime controls;
- complete CI with integration/e2e/security tests, OpenAPI drift, audits, secret scans on code and content branches, SBOM, license review, and image scans;
- encrypted database/object backups, independent content-repository mirror, restore automation, and incident/deployment runbooks;
- obtain the independent security review required by [SECURITY.md](SECURITY.md) §15 before exposing the admin panel to the public internet;
- final migration/reconciliation, bilingual smoke tests, search/crawl verification, monitoring, staged rollout, and rollback window;
- remove legacy JSON reads and obsolete client packages only after the rollback window closes.

Exit gate:

- all quality targets in [PRODUCT_SPEC.md](PRODUCT_SPEC.md) §7, all eleven release conditions in §10, and all applicable gates in [SECURITY.md](SECURITY.md) §15 pass;
- staging and production start reproducibly from a clean checkout and migrations run once;
- runtime images contain no article-source copy or embedded secrets;
- an isolated restore from database backup and MinIO object backup reconciles with zero unexplained differences;
- launch monitoring is stable through the agreed rollback window.

## 7. Release checkpoints

| Checkpoint         | Required milestones | What may be demonstrated                                                      |
| ------------------ | ------------------- | ----------------------------------------------------------------------------- |
| Foundation ready   | M0–M1               | Trusted schemas, database, render pipeline, and CI baseline                   |
| Data/content proof | M2–M3               | Verified portfolio data and PostgreSQL-native bilingual article               |
| Public preview     | M4–M5               | API-backed bilingual portfolio/blog reads and final appearance behavior       |
| Owner beta         | M5–M7               | Private/access-restricted secure admin and full non-blog portfolio management |
| Release candidate  | M8                  | Complete blog lifecycle and SEO surfaces                                      |
| Production         | M9                  | Operational, security, recovery, and launch gates complete                    |

No public preview may expose `/admin`. Owner beta remains private/access-restricted after M6–M7 and may be exposed to the public internet only after the independent security review and M9 release gates pass.

## 8. Cross-cutting rules

- **Security is delivered with each surface.** M6 establishes authentication; Markdown, database, upload, DTO, cache, and secret controls belong to the milestones that introduce them.
- **CI grows from M0 onward.** Container/image hardening finishes in M9, but format, lint, typecheck, real tests, migration checks, and secret scanning do not wait until then.
- **SEO and i18n are vertical concerns.** Route metadata, locale isolation, direction, and canonical behavior ship with each public page rather than as a late retrofit.
- **Migration remains reversible.** Legacy reads are removed only after reconciliation, production observation, and rollback-window acceptance.
- **One feature slice, one complete boundary.** Contract, database behavior, authorization, audit, cache invalidation, UI states, tests, and documentation land together.
- **No milestone bypasses its gate.** Known failures create follow-up work inside the same milestone; they are not silently moved to launch.

The feature-level definition of done in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) applies to every milestone.

## 9. Risk register

| Risk                                                | Earliest trigger | Required mitigation / proof                                                                                                   |
| --------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Partial article-save transaction                    | M3               | Single atomic PostgreSQL transaction; force rollback and verify unchanged article, revision, and outbox                       |
| Unauthenticated article mutation                    | M3               | No admin mutation routes before M6; strict service authorization, optimistic versions, audit, and CSRF                        |
| Appearance preference conflicts with shared caching | M0/M4            | Choose one delivery architecture and test first-byte correctness plus cache sharing before M5 exits                           |
| Migration loses or silently changes content         | M2               | Deterministic counts, checksums, byte comparisons, collision reports, and retained rollback reads                             |
| Passkey/session recovery locks out the owner        | M6               | Recovery codes, recent-auth policy, revocation procedure, and manual recovery drill                                           |
| Draft or wrong-locale content leaks through caches  | M4/M8            | Published-only predicates, explicit locale keys, disclosure tests, and targeted invalidation                                  |
| Malicious uploads or contact abuse                  | M4/M7/M9         | Server-side contact controls in M4; complete upload verification/quarantine in M7; operational retention and regression in M9 |
| Duplicate scheduler publishes twice                 | M8               | Exactly one logical scheduler, database lock/idempotency, duplicate-trigger tests, observable retries                         |
| Restore omits article bodies or media               | M9               | Restore drill always combines PostgreSQL and MinIO, then verifies source digests, rendered articles, and media references     |
| Scope exceeds sustainable throughput                | Every milestone  | Keep v1 non-goals closed, ship vertical slices, measure cycle time, and reforecast only at milestone reviews                  |

## 10. Immediate implementation queue

Items 1–3, 5, and 6 are complete, and items 7 and 8 are complete apart from the environment steps called out below. The next reviewable changes should be:

1. ~~**M0 baseline PR:** capture the original legacy baseline, fix repository-owned Phase 0 defects, disable the revoked EmailJS path honestly, and make clean quality commands reproducible.~~ Done, except the EmailJS provider-side revocation, which is deferred to the owner.
2. ~~**M0 decision review:** resolve the appearance-cache, slug, content-branch, dual-write recovery, worker, and outage questions; record ADRs.~~ Done — ADR-009 through ADR-014. MinIO is selected by ADR-008; M1 must prove its private adapter contract.
3. ~~**M0 CI PR:** add starter CI and real health/smoke tests so zero-test runs cannot be mistaken for coverage.~~ Done, plus full-history secret scanning.
4. **Owner action, not a PR:** rotate and revoke the EmailJS keys at the provider. This is the last thing holding the M0 gate open, and it does not block starting M1.
5. ~~**M1 contracts PR:** common IDs/locales/errors/pagination plus appearance preference names (`blogFont`, `blogSize`).~~ Done — also covers ADR-010 slug normalization, the scalar value objects, and the `portfolio_prefs` cookie resolution.
6. ~~**M1 Markdown PR:** frontmatter, deterministic serializer, restricted directives, sanitizer, and security corpus.~~ Done — `packages/markdown` renders sanitize-last with the directive allowlist and its security corpus.
7. ~~**M1 database PR:** Prisma models/constraints, migration-from-zero, deterministic seed, and test database.~~ Done — both migrations applied from zero to PostgreSQL 17, the supplemental constraints landed in the migration path, and consecutive seed runs produced identical asserted counts.
8. ~~**M1 media-foundation PR:** chosen MinIO adapter, verified media identity/ingestion contract, and local/test implementation.~~ Done — `packages/media` provides the private S3/MinIO and local adapters with magic-byte verification and SHA-256 identity.

The auth and content contract schemas are deliberately sequenced after the database slice rather than with the common ones, so they mirror the persisted shapes instead of anticipating them.

The queue's remaining items are environment work rather than code, and they are what the open gates are actually waiting on:

9. ~~**Environment, not a PR:** keep a real PostgreSQL available and stand up a private object store.~~ Done for the milestone proof — PostgreSQL 17 and a private MinIO bucket accepted M2's applied migration, exact media reconciliation, and no-write replay.
10. **Owner decision, not a PR:** pick accessible replacements for the three `#000000` skill colours (202, 306, 801) so M2's reconciliation has no unexplained warnings.
11. ~~**M3 implementation:** apply the PostgreSQL-native article migration, persist bilingual Markdown, and prove stale-version rollback, revision/outbox atomicity, and scheduled publication.~~ Done 2026-08-26. The migration applies from zero against a real PostgreSQL server, and `pnpm --filter @portfolio/database verify:articles` re-runs the 44-check proof on demand. Two caveats belong to CI rather than to the milestone: the run used PostgreSQL 16.13 because the sandbox cannot reach the 17 packages, and `prisma migrate diff` could not run there because the Prisma engine host is proxy-blocked.
12. ~~**M4 remaining public reads:** every portfolio and article read boundary, plus rendering M3's live bilingual article through them and proving publication invalidation end to end.~~ Done 2026-08-26. `pnpm --filter @portfolio/api verify:cutover` re-runs the 31-check proof against a running stack. The run fixed three defects — one corrupted article row `500`-ing blog discovery for a whole locale, two legacy URLs redirecting twice, and a seed that produced a site unable to boot — and left one open item, item 14.
13. ~~**M5 verification PR:** complete the [THEMING.md](THEMING.md) §9 test list, fonts/tokens, and the CI check for hard-coded colours.~~ Done 2026-08-24. The §9 automated list passes in a browser as its own CI job, fonts are reduced and range-scoped, and the raw-colour check has been in CI since 2026-08-16. ~~Complete the manual review.~~ Done 2026-08-25.

14. **Caching ADR, not a PR yet:** nothing is served from a shared cache. Measured with a counting proxy between the web app and the API, a repeat load of `/en/blog` makes five upstream API requests, and a database change appears in the rendered HTML with no purge delivered — so `revalidateTag` currently clears nothing and the API takes full read traffic. The likely cause is Next 16's explicit-caching model, where a shared read must live inside a `use cache` scope, and that touches ADR-009's dynamic per-visitor shell. Decide before writing code, and resolve before M9 sets any capacity or latency expectation.

15. ~~**M8 gate run:** prove the discovery, SEO and scheduled-publication slices against a running stack and a real browser.~~ Done 2026-09-04 — 56/56 in `verify:blog`, 45/45 in the public browser suite, the admin editor flow, and M7's proof re-run, recorded in [`status/evidence/M8-discovery-live.md`](status/evidence/M8-discovery-live.md). The run found five defects and closed them, and recorded two limitations it declined to hide: no generated share card for Persian, because the renderer cannot shape Arabic script, and pagination by cursor rather than page number.
16. **Next milestone:** M9, operations, release, and cleanup — now unblocked, since its M5 and M8 dependencies are closed. Item 14's caching ADR and the two overdue owner decisions (v1 editor permissions, contact/audit retention) should land before or with it: M9 is where capacity, latency and retention expectations are first written down, and all three are inputs to that.

The rule that held through M6–M8 — no admin or blog UI before its trust boundary is proven — is discharged: every surface behind `/admin` now sits behind an authenticated, live-proven boundary, and every public surface reads published, integrity-valid data only.

## 11. Roadmap maintenance

- Update the snapshot date and milestone status in the same pull request that opens or closes a milestone.
- Status values are `Not started`, `In progress`, `Blocked`, and `Complete`; `Complete` requires exit-gate evidence.
- Record accepted decisions in [DECISIONS.md](DECISIONS.md), not only in issue comments.
- Link test reports, reconciliation output, restore results, and security reviews from the milestone-closing pull request.
- Reforecast scope or dates only at milestone boundaries unless a security issue requires immediate action.
- Any change to v1 scope must update [PRODUCT_SPEC.md](PRODUCT_SPEC.md), this roadmap, and the detailed implementation plan together.
