# Implementation and migration plan

## Phase 0 — Architecture scaffold (current)

- Preserve the frontend under `apps/web`.
- Add pnpm workspace, API health scaffold, shared contracts/database package boundaries, and pinned planned dependencies.
- Approve product, architecture, API, data, security, SEO, and Docker specifications.

Exit: existing web app builds from the new location; API health scaffold builds; lockfile and workspace commands are valid.

## Phase 1 — Contracts and database foundation

1. Encode shared Zod schemas for IDs, pagination, errors, portfolio resources, Markdown posts, auth flows, and admin mutations.
2. Implement the Prisma models/constraints from [DATA_MODEL.md](DATA_MODEL.md).
3. Add migrations, generated-client wrapper, connection pooling, transaction helpers, and test database setup.
4. Validate all environment configuration at process startup.
5. Add unit tests for normalization, publishing state, slugs, safe URLs, and optimistic concurrency.

Exit: a clean database can migrate from zero, seed deterministic fixtures, and pass contract/schema tests. No browser receives database access.

## Phase 2 — Deterministic legacy migration

Create a versioned, repeatable migration command that reads the preserved legacy JSON/assets, validates them, writes in transactions, and emits a reconciliation report.

### Source mapping

| Current source | Target |
| --- | --- |
| `apps/web/src/DataBase/Projects.json` | `Project` plus `ProjectSkill` |
| `apps/web/src/DataBase/Skills.json` | `SkillCategory` plus `Skill` |
| `apps/web/src/DataBase/Certificate.json` | `Certificate` plus imported `MediaAsset` |
| `apps/web/src/DataBase/DailyQuote.json` | `Quote` |
| hard-coded hero/about/footer/header text | `PageSection`, `SiteSettings`, `SocialLink` |
| `apps/web/public/resume.pdf` | `MediaAsset` plus active `ResumeVersion` |
| certificate PDFs and public images | checksummed `MediaAsset` records/objects |

### Required cleanup

- Normalize legacy project statuses such as `Completed` to the approved enum rather than silently coercing unknown values.
- Resolve numeric technology references and fail on orphan skill IDs.
- Detect and correct text encoding/mojibake before approval; never “fix” text without showing the report.
- Reconcile path casing. The current JSON uses `web-2.pdf`/`web-3.pdf` while files are named `Web-2.pdf`/`Web-3.pdf`; Linux containers are case-sensitive.
- Validate every link/protocol and distinguish absent URLs from placeholder `#`.
- Generate stable slugs with an explicit collision report.
- Record file SHA-256, verified MIME, byte size, and safe public name.
- Store a migration version/checksum so reruns are idempotent.

Exit: source/target counts match, all relations/files reconcile, no warnings remain unexplained, and rollback to JSON reads remains possible.

## Phase 3 — Public API and frontend read migration

1. Implement public DTO allowlists and repository predicates that expose only published/enabled data.
2. Add site/projects/resume/blog-read endpoints with ETags and tests for draft leakage.
3. Add a typed server-side API client in Next.js with timeouts and controlled errors.
4. Migrate one public section at a time behind a server feature flag; compare rendered output before removing JSON imports.
5. Move GitHub statistics to a cached allowlisted server adapter.
6. Refactor the five files listed in the temporary ESLint legacy baseline and restore React hook/compiler rules to error level everywhere.

Exit: no production component imports `src/DataBase`; public pages remain functional during API outage according to the chosen stale/error strategy.

## Phase 4 — Authentication and security baseline

1. Implement one-time owner provisioning, Argon2id calibration, login throttling, and WebAuthn enrollment/assertion.
2. Add opaque hashed sessions, secure cookies, CSRF/origin validation, session management, recent-auth rules, and recovery codes.
3. Add deny-by-default role/policy guards and authorization tests.
4. Add header/CSP policy, structured redacted logging, audit events, and security notifications.
5. Run the authentication/session/CSRF gates in [SECURITY.md](SECURITY.md).

Exit: the admin shell is unreachable without verified credentials; every session/privileged path passes negative tests.

## Phase 5 — Admin content system

Implement the admin shell and resources in small vertical slices:

1. settings, page sections, navigation/social links
2. skill categories/skills and project relations
3. projects, certificates, quotes
4. media library and atomic resume activation
5. revisions, restore, audit viewer, sessions/users

Each slice includes shared contracts, API transaction/revision/audit behavior, accessible UI states, optimistic conflict handling, tests, and cache invalidation before moving to the next.

Exit: every item in PRODUCT_SPEC `ADMIN-004` is manageable without direct database/source edits.

## Phase 6 — Blog and SEO

1. Implement Markdown editor/preview with autosaved drafts and sanitized server rendering.
2. Implement post/category/tag CRUD, lifecycle transitions, scheduled publishing, revisions, and slug redirect history.
3. Build `/blog`, post, category/tag, preview, related-content, and accessible code/heading rendering.
4. Add dynamic metadata, canonical, JSON-LD, RSS, sitemap, robots, redirects, and `noindex` enforcement.
5. Add editorial checklist and automated validations from [SEO.md](SEO.md).

Exit: a post can move draft → preview → scheduled/published → revised/redirected/archived without private leakage, invalid cache, or broken canonical history.

## Phase 7 — Contact, uploads, and operational adapters

- Replace browser EmailJS with server-side SMTP adapter.
- Add contact anti-abuse, retention, delivery state, and safe admin access.
- Add streaming media verification/quarantine, image re-encoding, PDF policy, object lifecycle, and orphan cleanup.
- Add retries only where idempotent and observable.

Exit: public source maps/bundles contain no provider credentials; malicious upload/contact test corpora pass.

## Phase 8 — Docker, CI, and deployment hardening

1. Create multi-stage web/API images and local dependency/full/test Compose profiles.
2. Add separate migration job, health/readiness probes, least-privilege container controls, and runtime secrets.
3. CI: frozen install, format, lint, typecheck, unit/integration/e2e, builds, migration validation, OpenAPI drift check, audit, secret scan, SBOM, and image scan.
4. Add backup/restore automation and deployment/incident runbooks.

Exit: a clean checkout starts locally; staging deploys reproducibly; production database is not publicly exposed; restore drill succeeds.

## Phase 9 — Launch and cleanup

- Freeze content briefly, run final migration/reconciliation, smoke test public/admin paths, and verify headers/robots/sitemap/RSS/canonicals.
- Redirect old URLs and monitor errors, cache invalidations, authentication events, index coverage, and Core Web Vitals.
- Remove legacy JSON reads and client EmailJS package only after rollback window closes.
- Keep old files/backups under retention; do not silently delete them during deployment.

## Test strategy

| Layer | Coverage |
| --- | --- |
| Unit | schemas, state transitions, policies, slug/URL normalization, Markdown safety, DTO mapping |
| Database | constraints, transactions, optimistic concurrency, revisions/audit, public predicates |
| API integration | auth/CSRF/roles, CRUD, upload limits, publishing, error contract, caching |
| Web component | admin forms/conflicts, accessible editor/preview, public rendering states |
| End-to-end | owner login/passkey, edit/publish, resume replace, contact, redirects, draft privacy |
| Security | abuse corpus and release gates from `SECURITY.md` |
| Operations | migrate from zero, upgrade migration, backup/restore, container health/shutdown |

## Pull-request slicing

Keep changes reviewable and reversible. A recommended sequence is contracts/schema → migration → public reads → auth → each admin resource → blog lifecycle → SEO surfaces → contact/media → Docker/CI. Avoid combining a schema migration, auth rewrite, and large UI redesign in one change.

## Definition of done for any feature

- acceptance behavior and unhappy paths implemented
- request/response and database validation present
- authorization and audit decisions explicit
- tests at the appropriate layers passing
- accessibility and responsive states reviewed for UI
- loading/empty/error/conflict states handled
- logs redact sensitive values and include request context
- migration/cache/rollback implications documented
- relevant specs updated in the same change
