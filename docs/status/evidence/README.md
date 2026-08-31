# Milestone run evidence

This directory stores deterministic, non-secret reports produced while proving milestone exit gates. Each artifact is linked from its milestone status file and must be regenerated when its authoritative input changes.

Entries are grouped by milestone and, within a milestone, ordered so the run that closed its gate comes last.

## M2 — deterministic legacy migration

- [`M2-run.md`](M2-run.md) records the applied PostgreSQL/MinIO legacy migration.
- [`M2-reconciliation.json`](M2-reconciliation.json) is the machine-readable M2 preflight report.
- [`M2-page-sections-reconciliation.json`](M2-page-sections-reconciliation.json) is the machine-readable Hero/About and section-ordering migration plan. Regenerating it **with `BIRTH_DATE` unset** flips `birthDateConfigured` and changes the checksum; that is drift, not a result.
- [`M2-skill-colors-reconciliation.json`](M2-skill-colors-reconciliation.json) is the machine-readable plan for the three reviewed accessible skill-colour replacements, applied without changing the frozen source.

## M3 — PostgreSQL-native article foundation

- [`M3-live-run.md`](M3-live-run.md) is **historical only**: it records the Git-backed content store that ADR-015 superseded on 2026-08-25. Preserved for audit history; it does not describe the active design.
- [`M3-postgres-native-live.md`](M3-postgres-native-live.md) records the run that closed M3 — 44 checks against a real PostgreSQL server covering transactional bilingual saves, source/render integrity, immutable revisions, optimistic versions, and rollback proven twice.

## M4 — public bilingual cutover

- [`M4-projects-read.md`](M4-projects-read.md) records the live projects API, rendered-route, and rollback proof.
- [`M4-site-read.md`](M4-site-read.md) records the live site API, localized shell, rollback, and cold-outage proof.
- [`M4-appearance-read.md`](M4-appearance-read.md) records the live appearance API, first-response preference, rollback, and cold-outage proof.
- [`M4-home-read.md`](M4-home-read.md) records the live homepage collections, private document delivery, rollback, and selective-outage proof.
- [`M4-page-sections.md`](M4-page-sections.md) records the exact Hero/About migration, age privacy, ordered/disabled section rendering, and rollback proof.
- [`M4-project-detail.md`](M4-project-detail.md) records the project-detail API, optional image boundary, localized render, rollback, `404`, conditional-cache, and cold-outage proof.
- [`M4-i18n.md`](M4-i18n.md) records cookie/`Accept-Language` root negotiation, typed English/Persian UI catalogs, equivalent-page switching, localized formatting, and initial-HTML proof.
- [`M4-github-stats.md`](M4-github-stats.md) records the explicit 13-repository settings migration, allowlisted server fetcher, bounded fresh/stale/negative caches, real upstream responses, and localized initial-HTML proof.
- [`M4-github-stats-reconciliation.json`](M4-github-stats-reconciliation.json) is the machine-readable GitHub statistics settings migration plan.
- [`M4-http-503.md`](M4-http-503.md) records healthy, warm-outage, cold-outage, rollback, locale, disclosure, redirect, and `404` status behavior for the current public routes.
- [`M4-articles.md`](M4-articles.md) records the automated strict article API/client, bilingual route, no-fallback, render-provenance, SEO, and article-route outage boundary.
- [`M4-invalidation-live.md`](M4-invalidation-live.md) records the signed invalidation path driven end to end from a real save to the rendered page, with the outbox drained by the real worker.
- [`M4-public-cutover-live.md`](M4-public-cutover-live.md) records the run that closed M4 — 31 checks driving publish, update, and withdrawal through the rendered route, the leakage matrix, every legacy URL, and contact over real SMTP, with outage and rollback measured separately.

## M5 — appearance and accessibility

- [`M5-theme-tokens.md`](M5-theme-tokens.md) records the THEMING §3 token migration, the five AA failures it uncovered, the 26-pairing contrast matrix, and the CI enforcement scan.
- [`M5-appearance-matrix.md`](M5-appearance-matrix.md) records the browser half of the THEMING §9 test list against a production build, which closed M5's automated gates.

## M6 — authentication foundation

- [`M6-auth-boundary-live.md`](M6-auth-boundary-live.md) records the first run of the admin boundary as a running system — 24 checks of real HTTP against the ten API_SPEC §5 endpoints with a hand-built ES256 authenticator.
- [`M6-admin-shell-live.md`](M6-admin-shell-live.md) records the shell in a real browser with a Chrome virtual authenticator — 10 checks, and the two defects only a browser could find.
- [`M6-recovery-revocation-drill.md`](M6-recovery-revocation-drill.md) records the owner recovery and credential-revocation drill, 11 steps executed against [the runbook](../../runbooks/owner-recovery-and-revocation.md).

## M8 — blog authoring, publishing, and SEO

- [`M8-blog-authoring-live.md`](M8-blog-authoring-live.md) records the first M8 slice — 25 checks over the authenticated authoring boundary, taxonomy, save and autosave, the publish checklist, withdrawal, slug moves that collapse their own chains, archiving, and the revision/audit/invalidation evidence each transition leaves. It also records the defect it found: an invalidation reason the signed-event contract does not define, which failed every archive.

- [`M8-editor-live.md`](M8-editor-live.md) records the second M8 slice in a real browser — taxonomy creation, a new article, the directive palette, the publish checklist with a checkbox per warning, publication, and the preview route. It records three defects: a palette that could insert a block directive mid-line, every admin `<select>` announcing its own options as part of its accessible name, and a refused transition collapsed to a generic message that discarded what the API had answered with.

- [`M8-import-live.md`](M8-import-live.md) records the third M8 slice — 30/30 live API checks and the extended real-browser flow proving strict and bounded Markdown/MDX dry runs, executable-MDX rejection with source lines, exact private quarantine, visible inference and diff review, one-time confirmation, and lifecycle-preserving persistence through the normal article-save path.

- [`M8-restore-live.md`](M8-restore-live.md) records the fourth M8 slice — 41/41 live API checks and the extended real-browser flow proving that an earlier article version is restored by replaying its recorded source through the normal validated save: re-rendered and re-digested, recorded as a new revision, refused when the snapshot no longer matches its digest or the translation is archived, and never able to change publication state. It also records the defect it found: moving a slug back to a path that already redirected away collapsed the old rule into a redirect to itself, which the check constraint refused mid-transaction.

- [`M8-discovery-live.md`](M8-discovery-live.md) records the final discovery and regression proof: 57/57 live API checks, all 45 public browser tests, both real-stack admin flows, and 808 unit/integration tests. It records the build, locale-fixture, test-isolation, and cold-render corrections found during verification.

- [`M8-publication-live.md`](M8-publication-live.md) closes the scheduler/publication gate: deduplicated scheduling, idempotent publication, real post-write rollback, and a dedicated checked-out PostgreSQL session for leadership. Together these two reports close M8 on 2026-08-31.

## M7 — portfolio CMS

- [`M7-portfolio-cms-live.md`](M7-portfolio-cms-live.md) records the run that closed M7 — 31 API checks across the authenticated boundary, migrated inventory, conflict safety, archive protections, verified media and atomic resume activation, revision/audit/invalidation evidence, and the public reads taken afterwards, plus one real-browser test of the workspace and its conflict handling. It also records the two defects the run found: an unfinished record that returned `500` for a whole public collection, and the M6 role-assignment guard that M7's user endpoints never called.
