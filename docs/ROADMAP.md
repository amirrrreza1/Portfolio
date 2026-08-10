# Project roadmap

Status snapshot: **2026-08-10**

Active milestones: **M2, M3, M4, M5, and M6**. M2's applied write remains gated by a real PostgreSQL database and object store; M3/M6 have secure implementation foundations but remain open until their real Git/database/API exit gates are demonstrated. M4 and M5 opened ahead of their planned position — the locale shell, the server-side contact path, and the appearance/CSP layer are implemented — but both gates depend on public API read endpoints that do not exist yet. M0's repository-owned work is complete; its gate is held open by one owner action, see §6.

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

Phase 0 stabilization is complete in the repository, and every M1 implementation slice is present. Its real-database migration and clean-seed exit gate remains unproven. One M0 item — revoking the published EmailJS keys at the provider — is an owner action outside the repository and holds that gate open; it blocks nothing else.

Since the previous snapshot, work moved into M4 and M5 without waiting for M2/M3 to close. That was a deliberate trade — the root layout, locale shell, and colour usage are touched by every later surface, so doing them late would mean revisiting all of it — but it means two milestones are now open with implementation ahead of their proof. Neither can close until the public API read path from M4 exists, and neither has its specified test suite yet.

| Area                         | Current state                                                                                                                                                                                                                       | Roadmap implication                                                                                                                                                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace and specifications | pnpm monorepo, package boundaries, lockfile, environment template, and normative specifications exist                                                                                                                               | Preserve these boundaries; update specs and ADRs with each superseding decision                                                                                                                                                   |
| Public application           | `/[locale]` routes render with correct `lang`/`dir`, `/` issues a `308` to `/en`, and the legacy JSON reads are confined to one server module. The sections themselves are still the preserved legacy components                    | The header renders client-side only, so navigation is still absent from the server HTML; public API reads must replace the legacy adapter before M4 exits                                                                         |
| API                          | NestJS/Fastify exposes the health route and `POST /api/v1/contact`, both covered by real tests                                                                                                                                      | Public read endpoints, DTO allowlists, and the auth boundary are the next API work                                                                                                                                                |
| Contracts                    | `packages/contracts` exports the common, appearance, auth, content, contact, and blog-command modules across nine suites                                                                                                            | Complete for M1. Portfolio resource DTOs land with their M7 admin slices rather than ahead of them                                                                                                                                |
| Database                     | `packages/database` has a 41-model/19-enum Prisma schema, constraint SQL, pooled client, concurrency helpers, and deterministic seed                                                                                                | Migrations have not been generated or applied against a real PostgreSQL yet; see §6                                                                                                                                               |
| Markdown and Git content     | Renderer is delivered; `packages/content-store` provides GitHub App auth, secure writes, webhook trigger handling, and reconciliation primitives                                                                                    | Integrate with the API worker and prove a real content-branch run before M3 exits. `content/` does not exist in the repository yet                                                                                                |
| Blog and admin               | Feature folders have no routes yet; `packages/auth-core` now supplies password/session/CSRF/recovery/WebAuthn challenge primitives                                                                                                  | API boundary, full passkey verification, authorization, and admin shell remain M6 work                                                                                                                                            |
| Appearance                   | Appearance is resolved from the `portfolio_prefs` cookie in the root layout and emitted in the first byte; the settings dialog, reduced-motion wiring, theme tokens, and public CSP with a nonced pre-paint script are all in place | Token names are still the legacy `--color-primary`/`--color-secondary` set rather than the [THEMING.md](THEMING.md) §3 vocabulary; subsetting, `unicode-range`, route-scoped preload, and the entire §9 test list are outstanding |
| Operations and quality       | CI runs frozen install, format, lint, typecheck, real tests, builds, and full-history secret scanning; `--passWithNoTests` is gone from every package                                                                               | Expand continuously; container, audit, SBOM, and image scanning complete in M9                                                                                                                                                    |
| Legacy baseline              | [BASELINE_M0.md](BASELINE_M0.md) records the routes, content counts, and SHA-256 hashes of all 137 legacy source and asset files at the pre-stabilization commit                                                                    | Frozen. It is the comparison input for the M2 reconciliation and must not be regenerated                                                                                                                                          |

Findings from the verification passes that carry forward:

- `prettier --check` failed on 48 files before M0, so the CI format step could not have passed on any commit. The repository is now formatted, and `.gitattributes` pins LF endings — the CRLF drift in a Windows checkout was both the cause of that failure and the reason `git diff` reported every line of 86 files as changed.
- The legacy content reconciles against the figures already stated in the plan: 14 projects, 6 skill categories, 26 skills, 5 certificates, 35 quotes, and no orphan skill references. M2 inherits a clean starting point plus a test that keeps it that way.
- **Three** skill colours are `#000000`, not two: `Next.js (App Router)` (202), `shad CN` (306), and `Vercel` (801). The migration preflight reports all three; earlier revisions of this roadmap, the plan, and the inventory said two. The owner picks replacements before M2 applies.
- The M4/M5 code that has landed is not covered by the tests those milestones specify. `apps/web` has two suites (`test/age.spec.ts`, `test/legacy-assets.spec.ts`) and neither touches locale routing, appearance, contrast, or hydration. Implementation being present is not the same as a gate being met, and §6 records both separately.

The quality commands have not yet been run from a clean, fully hydrated checkout on a machine with the pinned Node and pnpm; see §6 for what that leaves outstanding.

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
| M1 — Trusted domain and media foundation | In progress | XL            | Shared contracts, Prisma schema/migrations, safe Markdown pipeline, and verified media identity/ingestion primitives | M0                 |
| M2 — Deterministic legacy migration      | In progress | M             | Repeatable legacy portfolio/media migration with reconciliation and rollback                                         | M1                 |
| M3 — Git content-store proof             | In progress | L             | Secure Git writes, webhook sync, reconciliation, and drift recovery                                                  | M1, M2             |
| M4 — Public bilingual cutover            | In progress | XL            | Published-only API reads become the default, with locale routing, SSR navigation, and an isolated rollback adapter   | M2, M3             |
| M5 — Appearance and accessibility        | In progress | M             | Flash-free site theme, blog-only typography, reduced motion, and tokenized colours                                   | M4                 |
| M6 — Authentication foundation           | In progress | L             | Owner provisioning, passkeys, sessions, CSRF, authorization, and audit baseline                                      | M1                 |
| M7 — Portfolio CMS                       | Not started | XL            | Every non-blog portfolio field, translation, media item, and resume manageable through admin                         | M2, M3, M4, M5, M6 |
| M8 — Blog authoring, publishing, and SEO | Not started | XL            | Editor/import/direct-push parity, lifecycle and scheduling, discovery, and locale SEO                                | M3, M4, M6, M7     |
| M9 — Operations, release, and cleanup    | Not started | L             | Operational contact/media controls, reproducible deployment, restore drill, launch, and rollback-window cleanup      | M5, M8             |

M0 is `Blocked` rather than `In progress`: every repository-owned deliverable is merged, and the only outstanding exit condition — revoking the EmailJS keys at the provider — cannot be done from the repository. It blocks nothing downstream, so work continues in parallel.

M4 and M5 are `In progress` even though their stated dependencies (M2 and M3) have not exited. That is a real ordering exception, not a re-plan: the shell work was pulled forward because it is cheaper before more UI exists, and the parts of M4/M5 that genuinely need migrated data or a proven content store — public DTO reads, blog surfaces, end-to-end invalidation — are exactly the parts still outstanding. Five open milestones is more parallel work in flight than §8 intends; closing M1's database gate collapses several of them at once and should come before any new milestone opens.

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

| Slice                                             | Status                   | Notes                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contracts — common and appearance                 | **Delivered**            | `packages/contracts`: branded IDs, locale allowlist, ADR-010 slug normalization, scalar value objects, cursor pagination, the error contract, the appearance registry, and the `portfolio_prefs` cookie with allowlist resolution                                                                               |
| Database — schema and constraints                 | **Delivered, unapplied** | `packages/database`: 41 models, 19 enums, 64 relation fields, 52 `CHECK` constraints and 6 partial indexes, pooled client, optimistic-concurrency and advisory-lock helpers, deterministic seed. Verified against an in-process PostgreSQL; **migrations have not been generated or run against a real server** |
| Contracts — auth, content, contact, blog commands | **Delivered**            | Password policy, login, WebAuthn, sessions and CSRF; the contact submission schema the API and the form now share; the frontmatter contract every authoring path converges on; sync state; and the article lifecycle commands. Nine suites in total                                                             |
| Markdown pipeline                                 | **Delivered**            | packages/markdown now provides bounded safe YAML/frontmatter parsing, byte-stable serialization, GFM/directive validation, server-only Shiki output, sanitize-last rendering, heading/reading-time derivation, and an XSS/YAML/URL corpus                                                                       |
| Media foundation                                  | **Delivered**            | packages/media provides private S3/MinIO and local/test object-store adapters, magic-byte MIME verification, SHA-256 identity, safe public names, and traversal-proof object-key handling                                                                                                                       |

Exit gate:

| Condition                                                                   | Status            | Evidence                                                                                                                                                                                                 |
| --------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A clean database migrates from zero and seeds deterministically             | **Outstanding**   | The schema, constraint SQL, and seed exist and are internally consistent, but no migration has been generated or applied. Run the steps in `packages/database/prisma/migrations/README.md` to close this |
| Frontmatter round-trips without semantic drift                              | **Met**           | The Markdown suite proves byte-stable serialize → parse → serialize output                                                                                                                               |
| The renderer and all security corpora pass                                  | **Met**           | The Markdown suite covers raw HTML/XSS, unsafe URLs, unknown/malformed directives, YAML aliases/duplicate keys, H1 rejection, heading uniqueness, and unknown code languages                             |
| Public/browser packages cannot import the database client or server secrets | **Partially met** | Enforced for contracts by `packages/contracts/test/boundaries.spec.ts`. `apps/web` still has no equivalent check; it imports no database client today, but nothing fails the build if that changes       |

The constraint suite (`packages/database/test/constraints.spec.ts`) proves each `CHECK` and partial index rejects what it claims to, using PostgreSQL compiled to WebAssembly rather than a database server, so it runs in CI today. Two constraints failed their own tests when first written: SQL's three-valued logic means a `CHECK` evaluating to NULL passes, which silently permitted a half-populated image dimension pair and an empty appearance allowlist.

### M2 — Deterministic legacy migration

Objective: move legacy portfolio data without losing fidelity, using the media primitives proven in M1.

Current slice: **preflight and reconciliation delivered.** The migration package
loads the preserved JSON snapshot, validates it before any write, normalizes only
reviewed values, and emits a deterministic report. The current snapshot has zero
errors and four explained warnings: the Portfolio placeholder URL becomes null
and three black skill colours need owner-selected accessible replacements. The
transactional writer and Prisma adapter now require verified media references
before they can write. `pnpm --filter @portfolio/database migrate:legacy --
--local-media-root <directory>` is explicit-apply only, records the exact
source checksum, skips a matching replay before creating objects, and removes
new objects if the database transaction fails. Applying it remains an
environment gate: a real PostgreSQL database and private object store must be
available for the final media-ingestion/reconciliation run.

The fourth deliverable is half done. `apps/web/src/server/legacy-portfolio.ts`
is now the only module that imports `src/DataBase`, which is the isolation the
adapter was meant to provide, but there is no rollback flag around it and no
migrated path to switch back from — it is currently the sole read path rather
than a dormant one. The flag lands with the M4 public reads it is supposed to
fall back from.

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

Current slice: `packages/content-store` now confines writes to `content/` on the
dedicated branch, exchanges GitHub App installation tokens, verifies and
deduplicates raw webhook deliveries, and reconciles Git trees through the
production Markdown renderer. The PostgreSQL apply ledger/outbox schema and
adapter are present. A real protected content branch, API worker, Git service,
and forced cross-system failure drill remain required exit evidence.

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

What is not built yet is the half the gate actually measures: there are no
public read endpoints or DTO allowlists, no typed server-side API client, no
message catalogs, and no blog route. `/` redirects unconditionally to `/en`
rather than negotiating cookie then `Accept-Language` as [I18N.md](I18N.md) §2
requires, and no legacy path other than `/` redirects at all. The header is
still `"use client"` and returns `null` until mounted, so the server HTML
contains no navigation. GitHub statistics are still fetched from the browser.

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

Current slice: appearance is server-resolved. The root layout reads
`portfolio_prefs`, validates it against the enabled allowlist through
`@portfolio/contracts/appearance`, and emits `data-theme` and `data-motion` on
`<html>` in the first byte; `ThemeContext` hydrates from those same attributes
instead of re-deriving them, and no longer touches `localStorage`. Blog font
and size are applied only to `.blog-reading-surface`. `system` mode is resolved
by the one reviewed nonced pre-paint script, and middleware sets the public CSP
alongside `Referrer-Policy`, `X-Content-Type-Options`, `X-Frame-Options`,
`Cross-Origin-Opener-Policy`, and `Permissions-Policy`. The settings dialog
ships, reduced motion is wired through the hero, particles, scramble text, and
typing text, and inline styles were removed from the application components.

Outstanding: the theme token set is still the legacy
`--color-primary`/`--color-secondary`/`--color-Gold` vocabulary rather than the
names in [THEMING.md](THEMING.md) §3, so §3's "components consume tokens only"
rule has no CI check behind it. Fonts remain the full 17-face `woff2` set with
no subsetting, no `unicode-range`, and no route-scoped preload. The one-time
`localStorage` → cookie migration in THEMING §5.6 was not implemented — the old
key is simply ignored, so an existing visitor silently reverts to the default
once. None of the §9 tests exist.

Deliverables:

- static theme tokens and blog-font registry; remove hard-coded component colours and add enforcement;
- cookie-backed, server-compatible theme resolution with no first-paint flash;
- `blogFont` and `blogSize` applied only to `.blog-reading-surface`, never `html`, `body`, shared chrome, portfolio pages, settings, or admin;
- accessible settings dialog for theme, blog typography, motion, and language;
- public CSP/security headers, including the reviewed nonce path for the pre-paint script;
- reduced-motion behavior across cube, particles, scramble/type effects, smooth scroll, and cursor;
- font subsetting/preload rules that do not download optional blog fonts on non-blog routes.

Exit gate:

- every enabled theme passes WCAG 2.2 AA checks;
- first render and hydration agree for every preference mode;
- blog typography scoping and non-blog font-download tests pass;
- public responses do not send `Vary: Cookie`, and the selected appearance-delivery strategy passes its shared-cache test;
- public, error, and no-JavaScript responses pass CSP and security-header checks.

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
7. ~~**M1 database PR:** Prisma models/constraints, migration-from-zero, deterministic seed, and test database.~~ Schema, constraints, client, and seed done; **migration-from-zero still needs to be run against a real PostgreSQL**.
8. ~~**M1 media-foundation PR:** chosen MinIO adapter, verified media identity/ingestion contract, and local/test implementation.~~ Done — `packages/media` provides the private S3/MinIO and local adapters with magic-byte verification and SHA-256 identity.

The auth and content contract schemas are deliberately sequenced after the database slice rather than with the common ones, so they mirror the persisted shapes instead of anticipating them.

The queue's remaining items are environment work rather than code, and they are what the open gates are actually waiting on:

9. **Environment, not a PR:** stand up a real PostgreSQL and a private object store. One step closes M1's migrate-from-zero gate, unblocks M2's applied migration and media-ingestion run, and gives M3 somewhere to persist its apply ledger. Nothing else in the queue unblocks three milestones at once.
10. **Owner decision, not a PR:** pick accessible replacements for the three `#000000` skill colours (202, 306, 801) so M2's reconciliation has no unexplained warnings.
11. **Environment, not a PR:** create the protected `content` branch and the repository-scoped GitHub App installation, then run the forced-failure drill M3's gate requires.
12. **M4 public-reads PR:** published-only DTOs and read endpoints, the typed server-side API client, and server-rendered navigation. Until this exists, M4 and M5 cannot close no matter how much of their UI is built.
13. **M5 verification PR:** the [THEMING.md](THEMING.md) §9 test list plus the CI check for hard-coded colours. The implementation is in place; the evidence is not.

Do not start the admin or blog UI to create the appearance of progress while their trust boundaries are unfinished. The M4/M5 pull-forward already stretched that rule as far as it should go.

## 11. Roadmap maintenance

- Update the snapshot date and milestone status in the same pull request that opens or closes a milestone.
- Status values are `Not started`, `In progress`, `Blocked`, and `Complete`; `Complete` requires exit-gate evidence.
- Record accepted decisions in [DECISIONS.md](DECISIONS.md), not only in issue comments.
- Link test reports, reconciliation output, restore results, and security reviews from the milestone-closing pull request.
- Reforecast scope or dates only at milestone boundaries unless a security issue requires immediate action.
- Any change to v1 scope must update [PRODUCT_SPEC.md](PRODUCT_SPEC.md), this roadmap, and the detailed implementation plan together.
