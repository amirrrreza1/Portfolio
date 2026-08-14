# M4 server-side GitHub statistics

Run date: **2026-08-14**

## Delivered boundary

- The deleted browser hook no longer calls GitHub from a visitor's device.
  Project cards receive statistics through React server-component props, and
  both successful values and localized unavailable states exist in initial
  HTML.
- The outbound adapter accepts only canonical HTTPS `github.com/<owner>/<repo>`
  project URLs whose owner and repository name match the strict
  `SiteSettings` username and explicit repository allowlist. It constructs the
  fixed `https://api.github.com` endpoint itself, rejects redirects, bounds each
  request to 3 seconds and each response to 64 KiB, and optionally uses the
  server-only `GITHUB_STATS_TOKEN`.
- Validated successes use the owner-configured TTL. Retryable failures may use a
  validated last-known-good value for at most 24 hours. A repository with no
  usable value renders unavailable and is negative-cached for at most five
  minutes, bounded further by the configured TTL.
- `connection()` places third-party work behind the Next.js request-time
  boundary. Repeated production builds made no GitHub request and did not
  consume a deployment IP's rate limit.

## Deterministic configuration migration

The separately versioned `2026-08-14.github-stats.1` migration derived an exact
13-repository allowlist from the frozen `Projects.json` URLs. Its preflight
rejects arbitrary hosts, owner mismatches, duplicate repository names, malformed
GitHub names, and TTL values outside 60–86400 seconds.

- First local PostgreSQL apply: `Legacy GitHub statistics settings migrated.`
- Immediate replay: `Legacy GitHub statistics settings already applied.`
- Read-only verification: allowlist count `13`, TTL `3600`, migration-ledger
  count `1`.
- Machine-readable plan:
  [`M4-github-stats-reconciliation.json`](M4-github-stats-reconciliation.json).

The migration is an independent explicit-apply command. It does not depend on
the M2 private birth-date snapshot, media store, or already-applied page-section
migration.

## Production-mode run

A built API read the migrated PostgreSQL settings on port `4405`, and a built
Next.js server used database mode on port `3311`. Both listeners were stopped
after the run.

- `/en/projects` returned `200` with **10** star/commit pairs in initial HTML.
  The first rendered pair was `2 Stars / 89 Commits` at run time.
- Three historical source links returned upstream `404` and rendered the
  English controlled-unavailable message: `Portfolio`, `Dastersi`, and
  `DigiKala-API-Code`. Current public repository discovery showed that the last
  two now exist under different names (`Dastresi` and `DigiKala-TS`); the frozen
  source and migration were not silently rewritten.
- `/fa/projects` returned `200`, `<html lang="fa" dir="rtl">`, **10** statistics
  sections, and **20** Persian-formatted number runs.
- Neither locale's HTML contained `api.github.com` or the deleted
  `useGitHubStats` hook.
- Repeated requests reused successful process-cache entries. The repeated
  `404` observation exposed and drove the bounded negative-cache addition;
  its retry ceiling is covered directly by the adapter suite.

## Automated verification

- Contract tests cover allowlist syntax, case-insensitive uniqueness, owner
  requirements, and TTL bounds through the strict public settings DTO.
- Migration tests cover the exact frozen 13-repository plan, apply/replay,
  changed-checksum refusal, arbitrary-host refusal, owner mismatch, duplicates,
  and invalid TTL.
- Adapter tests cover canonical URL parsing, no-fetch refusal for non-allowlisted
  URLs, fixed endpoints and headers, optional token use, real GitHub pagination
  shapes, fresh/stale/negative caches, 24-hour maximum stale age, 64 KiB limit,
  malformed payloads, and untrusted pagination links.
- The complete workspace passed **480 tests across 45 files**, all nine
  TypeScript checks, API/web ESLint, and both production builds.

The external GitHub data is informational. Its failure never breaks portfolio
content, and dead historical links remain visible as unavailable rather than
being replaced with unreviewed repository identities.
