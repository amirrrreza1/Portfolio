# Milestone run evidence

This directory stores deterministic, non-secret reports produced while proving milestone exit gates. Each artifact is linked from its milestone status file and must be regenerated when its authoritative input changes.

- [`M2-run.md`](M2-run.md) records the applied PostgreSQL/MinIO legacy migration.
- [`M2-reconciliation.json`](M2-reconciliation.json) is the machine-readable M2 preflight report.
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
- [`M4-articles.md`](M4-articles.md) records the automated strict article API/client, bilingual route, no-fallback, render-provenance, SEO, and article-route outage boundary, plus the live proof that remains open.
- [`M5-theme-tokens.md`](M5-theme-tokens.md) records the THEMING §3 token migration, the five AA failures it uncovered, the 26-pairing contrast matrix, and the CI enforcement scan.
