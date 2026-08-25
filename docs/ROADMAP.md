# Project roadmap

Status snapshot: **2026-08-24**

Active milestones: **M3, M4, and M6**. M2 is complete: its real PostgreSQL/MinIO apply/replay, public content/media, exact Hero/About, private age, ordered/disabled sections, and three reviewed accessible skill-colour replacements are all evidenced. M3/M6 have secure implementation foundations but remain open until their real Git/database/API exit gates are demonstrated. M4 has five live-proven portfolio read boundaries and now also has an automated-verification-complete public article boundary: strict published-only APIs, bilingual routes, no-fallback locale behavior, current-render provenance, 15-minute bounded stale reads, article-route `503`, and published-only metadata. M5 is complete: its database-backed appearance allowlist, full THEMING §9 browser matrix, and owner-approved light-theme and screen-reader review are evidenced. M0's repository-owned work is complete; its gate is held open by one owner action, see §6.

Target: **production-ready bilingual portfolio, blog, and owner-admin platform**

This roadmap is the status and sequencing layer for the project. [PRODUCT_SPEC.md](PRODUCT_SPEC.md) defines the required product, and [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) contains the detailed task order. A milestone is complete only when its exit gate is demonstrated; merging its last planned feature is not enough.

Calendar dates are intentionally not assigned yet. They depend on delivery capacity and on closing each infrastructure decision before its dependent milestone. Relative sizes in this document compare milestones with each other; they are not commitments.

## 1. Product outcome

The first production release provides:

- a server-rendered portfolio backed by PostgreSQL and editable through the admin panel;
- an English and Persian blog whose canonical article bodies are Markdown files in Git;
- equivalent panel, upload, and direct-push authoring paths through one safe render pipeline;
- site-wide visitor theme selection and blog-only font family and text-size selection;
- secure owner authentication, revisions, audit history, media/resume management, and recovery;
- locale-correct SEO surfaces, reproducible containers, CI security gates, backups, and a proven restore path.

The v1 non-goals in [PRODUCT_SPEC.md](PRODUCT_SPEC.md) §9 remain out of scope. In particular, v1 does not include public accounts, comments, newsletters, real-time collaboration, automatic translation, runtime MDX, or arbitrary uploaded fonts/CSS.

## 2. Current position

Phase 0 stabilization is complete in the repository, and M1 is complete. Its migrations and supplemental constraints applied from zero to PostgreSQL 17, consecutive deterministic seed runs produced stable counts, browser/server package boundaries are enforced, and API startup configuration is validated. One M0 item — revoking the published EmailJS keys at the provider — is an owner action outside the repository and holds that gate open; it blocks nothing else.

M4 and M5 were deliberately pulled forward without waiting for M2/M3 to close because the root layout, locale shell, and colour usage are touched by every later surface. M5 is now complete. M4 adds an automated-verification-complete article read/route/SEO slice to its five live-proven portfolio boundaries, root negotiation, public catalogs, and server-side GitHub statistics; it cannot close until M3 supplies a real reconciled bilingual article and signed publication invalidation is proven through the route.

| Area                         | Current state                                                                                                                                                                                                                                                                                                                                                        | Roadmap implication                                                                                                                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace and specifications | pnpm monorepo, package boundaries, lockfile, environment template, and normative specifications exist                                                                                                                                                                                                                                                                | Preserve these boundaries; update specs and ADRs with each superseding decision                                                                                                                    |
| Public application           | Existing portfolio routes plus `/[locale]/blog` and locale-specific article detail render server-side with correct `lang`/`dir`; article `404` never falls back, article `503` uses a 15-minute validated ceiling, and published-only canonical/hreflang/JSON-LD metadata is implemented. Earlier portfolio/root/catalog/GitHub boundaries remain production-proven. | Prove a real M3-reconciled bilingual article and signed publication invalidation; complete discovery/social-image behavior                                                                         |
| API                          | NestJS/Fastify exposes health/contact plus strict public project, site, appearance, home, and cursor-paginated article list/detail endpoints with ETag/conditional-cache behavior. Article discovery is published/`SYNCED` only and detail requires current valid render provenance.                                                                                 | Connect the real content worker/invalidation outbox; the auth/admin boundary remains later work                                                                                                    |
| Contracts                    | `packages/contracts` exports strict portfolio and public article DTOs, including canonical locale slugs, sanitized render payloads, headings, published alternates, cursor envelopes, and bounded translation-missing errors; tests reject internal fields and cross-locale shapes.                                                                                  | Public read shapes are delivered; admin command DTOs remain M7/M8 work                                                                                                                             |
| Database                     | `packages/database` has a 41-model/19-enum Prisma schema, three schema migrations, separately ledgered content, page-section, and GitHub-statistics settings migrations, supplemental constraints, a pooled client, concurrency helpers, and deterministic seed                                                                                                      | M1/M2 apply/replay passed; content, media, exact Hero/About, private age, ordering, rollback, the GitHub repository allowlist, and the three reviewed colour replacements are proven.              |
| Markdown and Git content     | Renderer is delivered; `packages/content-store` provides GitHub App auth, secure writes, webhook trigger handling, reconciliation primitives, and live recovery for invalid/missing files. A real bilingual article is reconciled from the `content` branch.                                                                                                         | Apply owner-level branch protection and secret scanning, then prove a public webhook and the remaining Git/database-outage recovery drills before M3 exits.                                        |
| Blog and admin               | Public bilingual blog list/detail routes now exist over strict API DTOs; authoring/publishing/admin routes do not. `packages/auth-core` supplies password/session/CSRF/recovery/WebAuthn challenge primitives.                                                                                                                                                       | Real Git-backed content, invalidation, full passkey verification, authorization, and the admin shell remain                                                                                        |
| Appearance                   | The root layout resolves `portfolio_prefs` against a strict locale-scoped database/legacy owner allowlist and emits the result in the first byte; the dialog consumes that allowlist, and live database/rollback plus localized HTTP `503` outage proof exists                                                                                                       | Token names are still the legacy `--color-primary`/`--color-secondary` set; subsetting, `unicode-range`, route-scoped preload, and the complete [THEMING.md](THEMING.md) §9 matrix are outstanding |
| Operations and quality       | CI runs frozen install, format, lint, typecheck, real tests, builds, and full-history secret scanning; `--passWithNoTests` is gone from every package                                                                                                                                                                                                                | Expand continuously; container, audit, SBOM, and image scanning complete in M9                                                                                                                     |
| Legacy baseline              | [BASELINE_M0.md](BASELINE_M0.md) records the routes, content counts, and SHA-256 hashes of all 137 legacy source and asset files at the pre-stabilization commit                                                                                                                                                                                                     | Frozen. It is the comparison input for the M2 reconciliation and must not be regenerated                                                                                                           |

Findings from the verification passes that carry forward:

- `prettier --check` failed on 48 files before M0, so the CI format step could not have passed on any commit. The repository is now formatted, and `.gitattributes` pins LF endings — the CRLF drift in a Windows checkout was both the cause of that failure and the reason `git diff` reported every line of 86 files as changed.
- The legacy content reconciles against the figures already stated in the plan: 14 projects, 6 skill categories, 26 skills, 5 certificates, 35 quotes, and no orphan skill references. M2 inherits a clean starting point plus a test that keeps it that way.
- **Three** skill colours are `#000000`, not two: `Next.js (App Router)` (202), `shad CN` (306), and `Vercel` (801). The migration preflight reports all three; earlier revisions of this roadmap, the plan, and the inventory said two. The source-preserving proof applied them unchanged; the owner picks accessible replacements before M2's final accepted migration version.
- M4 now has route-helper and locale/resource-isolation coverage plus live projects, site-shell/section, appearance, homepage, private-document, rollback, root-negotiation, catalog, equivalent-page switching, server-side GitHub statistics, and real HTTP `503` outage proof. The article contract/API/client/routes/no-fallback/SEO/outage boundary is automated-verification complete, but live M3 reconciliation, signed publication invalidation, full discovery/social-image behavior, and milestone-wide cross-locale HTTP evidence remain. M5's [THEMING.md](THEMING.md) §9 matrix is complete as of 2026-08-24: the contrast half runs in the contracts suite, and the rest runs in a browser as its own CI job.

The root quality commands now prepare generated workspace-package artifacts themselves. The current workspace has 505 passing tests across 51 files in all nine tested apps/packages; every workspace typecheck, declared API/full web lint, all seven library emits, the API build, and the Next.js production build pass. The Windows build-path defect was traced to `outputFileTracingRoot` using a URL pathname rather than a native path; it now uses `fileURLToPath` so standalone tracing remains inside the intended workspace. This run used the installed binaries directly because pnpm's non-interactive dependency-store guard stopped the root wrapper before its scripts; M0's clean-checkout gate therefore remains separate and open.

## 3. Decisions that gate implementation

Each decision below requires an ADR or an explicit amendment to an existing ADR before the dependent implementation begins.

| Decision                                                                                           | Must be closed by                                                                                 | Why it blocks work                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-visitor appearance delivery                                                                    | **Accepted: ADR-009**; prove in M4/M5                                                             | Dynamic HTML shell emits cookie-specific attributes while public data/render caches stay shared and appearance-free                                                                                                                   |
| Persian slug policy                                                                                | **Accepted: ADR-010**; implement in M1                                                            | Unicode Persian is canonical; normalized ASCII transliterations may be redirect aliases                                                                                                                                               |
| Git write branch and protection model                                                              | **Accepted: ADR-011**; prove in M3                                                                | Protected dedicated `content` branch is not merged into the deployment branch during normal publishing                                                                                                                                |
| Recovery after Git succeeds but PostgreSQL or invalidation fails                                   | **Accepted: ADR-012**; prove in M3/M4                                                             | Durable operation log, idempotent apply ledger, reconciliation, and invalidation outbox                                                                                                                                               |
| MinIO deployment and verified ingestion boundary                                                   | Before M2                                                                                         | Certificate/resume migration and later admin media depend on stable media IDs and checksums                                                                                                                                           |
| Public API outage strategy                                                                         | **Accepted: ADR-014**; prove in M4                                                                | Bounded last-known-good published DTOs with per-surface maximum stale windows; cold/expired routes fail with controlled `503`                                                                                                         |
| Scheduler and sync-worker topology                                                                 | **Accepted: ADR-013**; prove in M3/M8                                                             | Dedicated PostgreSQL-backed worker and advisory-lock scheduler; API replicas run no timers                                                                                                                                            |
| Hosting/reverse proxy, monitoring, retention defaults, analytics choice, and v1 editor permissions | Deadlines assigned in `DECISIONS.md`; **the hosting and editor-permission deadlines are overdue** | These choices affect adapters, privacy, authorization, runbooks, and final deployment. M4 and M6 opened without them; see the note under the deadline table in [DECISIONS.md](DECISIONS.md#decision-deadlines-for-remaining-adapters) |

## 4. Delivery map

```mermaid
flowchart LR
    M0["M0 Baseline and decisions"] --> M1["M1 Domain and media foundation"]
    M1 --> M2["M2 Deterministic migration"]
    M2 --> M3["M3 Git content store"]
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

M6 may run alongside M2–M5 once M1 is stable. M7 API/domain work may begin after M2 and M6, but its UI uses the M5 design-system boundary, its content-store-health slice needs M3, and its end-to-end invalidation gate needs M4. For a single developer, follow the numbered order unless switching tracks removes a genuine external blocker.

Two dependencies are non-negotiable:

1. The Markdown parser, sanitizer, and security corpus pass before the Git content store accepts content.
2. The Git content store is proven before blog authoring and lifecycle UI are built on it.

## 5. Milestone summary

| Milestone                                | Status      | Relative size | Outcome                                                                                                              | Depends on         |
| ---------------------------------------- | ----------- | ------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------ |
| M0 — Baseline, guardrails, and decisions | Blocked     | S             | Verified scaffold, urgent risk cleanup, starter CI, and closed architectural blockers                                | —                  |
| M1 — Trusted domain and media foundation | Complete    | XL            | Shared contracts, Prisma schema/migrations, safe Markdown pipeline, and verified media identity/ingestion primitives | M0                 |
| M2 — Deterministic legacy migration      | Complete    | M             | Repeatable legacy portfolio/media migration with reconciliation and rollback                                         | M1                 |
| M3 — Git content-store proof             | In progress | L             | Secure Git writes, webhook sync, reconciliation, and drift recovery                                                  | M1, M2             |
| M4 — Public bilingual cutover            | In progress | XL            | Published-only API reads become the default, with locale routing, SSR navigation, and an isolated rollback adapter   | M2, M3             |
| M5 — Appearance and accessibility        | Complete    | M             | Flash-free site theme, blog-only typography, reduced motion, and tokenized colours                                   | M4                 |
| M6 — Authentication foundation           | In progress | L             | Owner provisioning, passkeys, sessions, CSRF, authorization, and audit baseline                                      | M1                 |
| M7 — Portfolio CMS                       | Not started | XL            | Every non-blog portfolio field, translation, media item, and resume manageable through admin                         | M2, M3, M4, M5, M6 |
| M8 — Blog authoring, publishing, and SEO | Not started | XL            | Editor/import/direct-push parity, lifecycle and scheduling, discovery, and locale SEO                                | M3, M4, M6, M7     |
| M9 — Operations, release, and cleanup    | Not started | L             | Operational contact/media controls, reproducible deployment, restore drill, launch, and rollback-window cleanup      | M5, M8             |

M0 is `Blocked` rather than `In progress`: every repository-owned deliverable is merged, and the only outstanding exit condition — revoking the EmailJS keys at the provider — cannot be done from the repository. It blocks nothing downstream, so work continues in parallel.

M4 is `In progress` even though its stated M3 dependency has not exited. That is a real ordering exception, not a re-plan: the shell work was pulled forward because it is cheaper before more UI exists, and the parts of M4 that genuinely need a proven content store — real reconciled article reads and end-to-end invalidation — are exactly the parts still outstanding. Three milestones remain open; no new milestone should open until the proof backlog contracts.

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

| Slice                                             | Status                    | Notes                                                                                                                                                                                                                                                  |
| ------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contracts — common and appearance                 | **Delivered**             | `packages/contracts`: branded IDs, locale allowlist, ADR-010 slug normalization, scalar value objects, cursor pagination, the error contract, the appearance registry, and the `portfolio_prefs` cookie with allowlist resolution                      |
| Database — schema and constraints                 | **Delivered and applied** | `packages/database`: 41 models, 19 enums, 64 relation fields, 52 `CHECK` constraints and 6 partial indexes, pooled client, optimistic-concurrency and advisory-lock helpers, deterministic seed, and two migrations applied from zero to PostgreSQL 17 |
| Contracts — auth, content, contact, blog commands | **Delivered**             | Password policy, login, WebAuthn, sessions and CSRF; the contact submission schema the API and the form now share; the frontmatter contract every authoring path converges on; sync state; and the article lifecycle commands. Nine suites in total    |
| Markdown pipeline                                 | **Delivered**             | packages/markdown now provides bounded safe YAML/frontmatter parsing, byte-stable serialization, GFM/directive validation, server-only Shiki output, sanitize-last rendering, heading/reading-time derivation, and an XSS/YAML/URL corpus              |
| Media foundation                                  | **Delivered**             | packages/media provides private S3/MinIO and local/test object-store adapters, magic-byte MIME verification, SHA-256 identity, safe public names, and traversal-proof object-key handling                                                              |

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

### M3 — Git content-store proof

Objective: prove Git-backed article integrity and recovery before any editor depends on it.

Current slice: **the worker and its queue are built.** `packages/content-store`
confines writes to `content/` on the dedicated branch, exchanges GitHub App
installation tokens, verifies and deduplicates raw webhook deliveries, and
reconciles Git trees through the production Markdown renderer. The PostgreSQL
apply ledger/outbox schema and adapter are present.

ADR-013's durable queue now exists as a `content_jobs` table claimed with
`FOR UPDATE SKIP LOCKED`, with leases, capped exponential backoff, and
dead-letter visibility; per-post ordering and burst collapsing are enforced by
partial unique indexes rather than by application code, and the claim semantics
are proven against real PostgreSQL under PGlite. A dedicated worker process
built from the API workspace runs in `sync` or `scheduler` mode behind an
advisory lock, the webhook endpoint authenticates a delivery and enqueues
without ever reading the payload as data, and `/health` now separates liveness
from readiness — a degraded content pipeline reports itself at `200` and stays
in rotation, because public reads never touched Git.

A real protected content branch, the first real bilingual article, and the
forced cross-system failure drills remain required exit evidence. None of them
can be produced without the GitHub App.

Deliverables:

- GitHub App authentication with least privilege, content-prefix enforcement, safe commit metadata, branch protection, and blob-SHA `If-Match` writes;
- signed/replay-protected webhook, per-post serialization, sync worker, reconciliation job, sync log, and drift visibility;
- explicit idempotent recovery for Git-success/database-failure and invalidation-failure cases;
- failure tests for forged webhooks, stale SHA, invalid/deleted files, path escape, Git outage, and forced database failure after a successful commit;
- secret scanning on the content branch before automated or direct content commits are accepted;
- one real article in both locales added by direct push and reconciled into the read index.

Exit gate:

- a valid push appears in the indexed render cache without deployment; end-to-end route invalidation is proven in M4;
- invalid or deleted repository content does not change live output or silently unpublish;
- a forced partial failure converges through retry/reconciliation without duplicate state;
- Git unavailability blocks authoring only, not public reads or database-driven publication state.

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
a real M3-reconciled bilingual article, end-to-end signed publication
invalidation, full discovery/social-image behavior, and live article HTTP proof.

Deliverables:

- published/enabled-only public DTOs and API endpoints with ETags, locale-scoped cache tags, and exclusion of every non-`SYNCED` article translation from public discovery;
- typed server-side Next.js API client with bounded timeouts and the chosen outage behavior;
- `/[locale]/` routing, one-hop legacy `308` redirects, dynamic `lang`/`dir`, message catalogs, and bidi-safe shared components;
- server-rendered navigation, metadata/canonical foundations, and a minimal read-only route proving the seeded bilingual article; complete blog discovery surfaces remain in M8;
- section-by-section migration behind feature flags, comparing rendered output before removing each JSON import;
- server-side cached GitHub statistics and draft/cross-locale leakage tests;
- server-side SMTP contact submission with validation, layered anti-abuse controls, a generic response, and no browser/provider credential.

Exit gate:

- the active production path has no component import from `src/DataBase`; the dormant legacy adapter is reachable only through the tested server-side rollback flag;
- English and Persian routes render with correct direction; missing Persian portfolio fields deliberately fall back to English, while a missing article translation returns `404` without fallback;
- every legacy URL redirects exactly once;
- navigation is present in initial HTML and the tested outage behavior is consistent;
- public caches/listings never contain draft, preview, scheduled, archived, non-`SYNCED`, or cross-locale content;
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

Current slice: `packages/auth-core` delivers opaque keyed session/CSRF tokens,
Argon2id password hashing, uniform password-step failures, recovery-code
hashing, single-use WebAuthn challenges, and cookie-mutation guards.
`provision:owner` is explicit-apply and bootstrap-file/expiry gated. Prisma
adapters persist password sessions and one-time challenges. The API login and
passkey verification endpoints, authorization policy, audit events, and
credential-revocation drill are still outstanding.

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

Deliver slices in this order:

1. site/appearance settings, page sections, navigation, and social links;
2. skills/categories and project relationships;
3. projects, certificates, and quotes;
4. media/resume upload with streaming limits, magic-byte and decode verification, safe object keys, image re-encoding, PDF policy/quarantine, reference authorization, atomic activation, and abuse tests;
5. per-locale translations and untranslated-field indicators;
6. revisions/restore, audit viewer, content-store health, sessions, and permitted user management.

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

Objective: deliver one coherent article lifecycle across panel, upload, and Git.

Deliverables:

- Markdown editor, directive palette, database-only autosave, production-pipeline preview, and blob-SHA conflict diff;
- `.md`/`.mdx` dry-run import, normalization report, confirmation, original-file quarantine, and rejection of executable MDX constructs;
- post/translation/taxonomy CRUD, per-locale state transitions, revisions, slug history, redirects, and scheduled publishing with bot reconciliation;
- locale blog index/detail/category/tag/preview pages with accessible headings and code blocks;
- dynamic metadata, canonicals, reciprocal `hreflang`, JSON-LD, per-locale RSS/sitemaps, robots, related content, and editorial checks; every discovery surface excludes non-`SYNCED` translations;
- single-scheduler and Git-outage publication tests.

Exit gate:

- panel authoring, file import, and direct push produce identical sanitized output;
- draft → preview → scheduled/published → revised/redirected/archived works independently per locale;
- conflicts write nothing until explicitly resolved;
- scheduled publication succeeds with Git unavailable and reports frontmatter drift;
- automated SEO, redirect, disclosure, sync-state, and cross-locale tests pass;
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
- an isolated restore from database backup, Git mirror, and object backup reconciles with zero unexplained differences;
- launch monitoring is stable through the agreed rollback window.

## 7. Release checkpoints

| Checkpoint         | Required milestones | What may be demonstrated                                                      |
| ------------------ | ------------------- | ----------------------------------------------------------------------------- |
| Foundation ready   | M0–M1               | Trusted schemas, database, render pipeline, and CI baseline                   |
| Data/content proof | M2–M3               | Reconciled portfolio data and direct-push bilingual article                   |
| Public preview     | M4–M5               | API-backed bilingual portfolio/blog reads and final appearance behavior       |
| Owner beta         | M5–M7               | Private/access-restricted secure admin and full non-blog portfolio management |
| Release candidate  | M8                  | Complete blog lifecycle and SEO surfaces                                      |
| Production         | M9                  | Operational, security, recovery, and launch gates complete                    |

No public preview may expose `/admin`. Owner beta remains private/access-restricted after M6–M7 and may be exposed to the public internet only after the independent security review and M9 release gates pass.

## 8. Cross-cutting rules

- **Security is delivered with each surface.** M6 establishes authentication; Markdown, Git, upload, DTO, cache, and secret controls belong to the milestones that introduce them.
- **CI grows from M0 onward.** Container/image hardening finishes in M9, but format, lint, typecheck, real tests, migration checks, and secret scanning do not wait until then.
- **SEO and i18n are vertical concerns.** Route metadata, locale isolation, direction, and canonical behavior ship with each public page rather than as a late retrofit.
- **Migration remains reversible.** Legacy reads are removed only after reconciliation, production observation, and rollback-window acceptance.
- **One feature slice, one complete boundary.** Contract, database behavior, authorization, audit, cache invalidation, UI states, tests, and documentation land together.
- **No milestone bypasses its gate.** Known failures create follow-up work inside the same milestone; they are not silently moved to launch.

The feature-level definition of done in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) applies to every milestone.

## 9. Risk register

| Risk                                                | Earliest trigger | Required mitigation / proof                                                                                                   |
| --------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Git/PostgreSQL split-brain                          | M3               | Idempotent retry/reconciliation; force a database failure after commit and prove convergence                                  |
| Content credential can modify code/workflows        | M3               | GitHub App with minimal permission, protected branch/path checks, short-lived token, audited refusal tests                    |
| Appearance preference conflicts with shared caching | M0/M4            | Choose one delivery architecture and test first-byte correctness plus cache sharing before M5 exits                           |
| Migration loses or silently changes content         | M2               | Deterministic counts, checksums, byte comparisons, collision reports, and retained rollback reads                             |
| Passkey/session recovery locks out the owner        | M6               | Recovery codes, recent-auth policy, revocation procedure, and manual recovery drill                                           |
| Draft or wrong-locale content leaks through caches  | M4/M8            | Published-only predicates, explicit locale keys, disclosure tests, and targeted invalidation                                  |
| Malicious uploads or contact abuse                  | M4/M7/M9         | Server-side contact controls in M4; complete upload verification/quarantine in M7; operational retention and regression in M9 |
| Duplicate scheduler publishes twice                 | M8               | Exactly one logical scheduler, database lock/idempotency, duplicate-trigger tests, observable retries                         |
| Restore omits one authoritative store               | M9               | Restore drill always combines PostgreSQL, Git, and MinIO, then runs reconciliation                                            |
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
11. **Environment, not a PR:** create the protected `content` branch and the repository-scoped GitHub App installation, then run the forced-failure drill M3's gate requires.
12. **M4 remaining public reads:** projects including detail/optional image mediation, site shell/sections, appearance, homepage collections, certificates, active resume, exact Hero/About, root negotiation/catalogs, and GitHub statistics have contract/client/render/rollback proof. Extend the public-data boundary to articles before M4 can close.
13. ~~**M5 verification PR:** complete the [THEMING.md](THEMING.md) §9 test list, fonts/tokens, and the CI check for hard-coded colours.~~ Done 2026-08-24. The §9 automated list passes in a browser as its own CI job, fonts are reduced and range-scoped, and the raw-colour check has been in CI since 2026-08-16. ~~Complete the manual review.~~ Done 2026-08-25.

Do not start the admin or blog UI to create the appearance of progress while their trust boundaries are unfinished. The M4/M5 pull-forward already stretched that rule as far as it should go.

## 11. Roadmap maintenance

- Update the snapshot date and milestone status in the same pull request that opens or closes a milestone.
- Status values are `Not started`, `In progress`, `Blocked`, and `Complete`; `Complete` requires exit-gate evidence.
- Record accepted decisions in [DECISIONS.md](DECISIONS.md), not only in issue comments.
- Link test reports, reconciliation output, restore results, and security reviews from the milestone-closing pull request.
- Reforecast scope or dates only at milestone boundaries unless a security issue requires immediate action.
- Any change to v1 scope must update [PRODUCT_SPEC.md](PRODUCT_SPEC.md), this roadmap, and the detailed implementation plan together.
