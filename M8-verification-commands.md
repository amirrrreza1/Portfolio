# M8 verification — completed 2026-08-31

M8 is complete. The final run passed 63 live API checks, 45 public browser
tests, both real-stack admin flows, and 817 unit/integration tests. Builds,
typecheck, lint, formatting, and schema validation also passed.

Reports:

- [Discovery, SEO, and regression evidence](docs/status/evidence/M8-discovery-live.md)
- [Scheduled publication and pinned-session locking](docs/status/evidence/M8-publication-live.md)
- [Milestone status](docs/status/M8.md)

## Repeat the quality gates

Run from the repository root using the pinned Node/pnpm versions:

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm db:validate
pnpm format:check
```

The build needs `PUBLIC_SITE_URL` and `BIRTH_DATE`. All database suites ran
locally on Windows, including the ones that call `prisma migrate diff`.

## Repeat the live proof

Use a **disposable** PostgreSQL/MinIO/SMTP stack and the compiled API.
Apply the checked-in migrations and seed first. The API and verification
process must share their database, recovery secret, and web origin.

```powershell
pnpm --filter @portfolio/api verify:blog
```

The script has an explicit `--apply` argument in its package script. It creates
fixture content and deliberately corrupts fixture digests/revisions. Do not
point it at production or a database whose contents you want to preserve.

The 63 checks include 10 discovery checks, 6 scheduling/publication checks,
and 6 saved Markdown export checks.
Section 10 proves deduplicated enqueue, idempotent publication, invalid-source
refusal, rollback after actual writes, pinned-session exclusion, and release.

## Repeat the browser proofs

The public project starts its own production web build and contract-validated
fixture API. It does not require admin credentials:

```powershell
pnpm --filter @portfolio/web exec playwright test discovery
pnpm --filter @portfolio/web exec playwright test
```

The second command includes the first suite: 45 tests total, not 55.

The admin project needs a separately running production web/API stack and
`E2E_ADMIN_BASE_URL`, `E2E_CMS_OWNER_EMAIL`, `E2E_CMS_OWNER_PASSWORD`, and
`E2E_CMS_OWNER_RECOVERY_CODE`. Provision only a disposable fixture owner.
The web origin must match `WEBAUTHN_ORIGIN`. Re-provision before each flow,
because successful recovery consumes its code:

```powershell
pnpm --filter @portfolio/api provision:cms-browser
pnpm --filter @portfolio/web exec playwright test --config playwright.admin.config.mts blog-editor
pnpm --filter @portfolio/api provision:cms-browser
pnpm --filter @portfolio/web exec playwright test --config playwright.admin.config.mts portfolio-cms
```

Use the documented `PLAYWRIGHT_CHROMIUM_EXECUTABLE` override if using an
installed compatible Chrome instead of Playwright's pinned download. This run
used Chrome 151.0.7922.174. For disposable Mailpit on Docker Desktop, use
`--smtp-disable-rdns` to avoid reverse-DNS delays before its SMTP greeting.

Run public and real-stack web builds sequentially: both use `apps/web/.next`.
Use `exec playwright test <filter>` so pnpm does not forward an extra literal
`--` to the test runner.
