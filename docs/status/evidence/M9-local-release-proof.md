# M9 local release proof

Date: 2026-09-05  
Branch: `dev`  
Pulled revision: `4bb200c` (`origin/dev`)

## Quality and policy matrix

- `pnpm format:check`, `pnpm lint`, and `pnpm typecheck`: pass.
- `PUBLIC_SITE_URL=https://example.com BIRTH_DATE=2000-01-01 pnpm build`: pass for all declared packages, Nest API, and the standalone Next.js production app.
- `pnpm test`: 828 assertions pass across 81 files and eight tested apps/packages.
- `CI=1 pnpm --filter @portfolio/web test:e2e`: 45/45 Chromium checks pass against a production build, including first-paint appearance, reduced motion, font requests, bilingual discovery, CSP, and outage behavior.
- `pnpm openapi:check`: generated contract has no drift.
- `pnpm security:licenses`: 522 third-party production packages reviewed across 14 approved license expressions.
- `pnpm security:audit`: high-severity gate passes; pnpm reports six moderate advisories for follow-up.
- Production Compose render with the `full` and `test` profiles: pass.

## Container topology

A uniquely named disposable stack was built from the working tree with PostgreSQL 17.6, private versioned MinIO, Mailpit, one-shot MinIO initialization and migration jobs, API, publication/scheduler/maintenance workers, standalone web, and Caddy.

- All eight Prisma migrations applied once; both one-shot jobs exited successfully.
- Every long-running service became healthy. `/api/v1/health/ready` returned `status`, `database`, `storage`, and `publication` as `ok`, with an empty healthy publication queue.
- Maintenance emitted repeated structured `info` passes with zero failure/exhaustion counters and all retention counters present.
- MinIO created a private versioned bucket and attached the app-scoped list/location/get/put/delete policy to the non-root application identity.
- API attached only to app/data/services/egress as required; Caddy attached to app/egress so ACME and upstream traffic are possible without publishing data services.
- API, web, migration, and operations images run as UID/GID 10001. The web runtime contained both Vazir script subsets, no legacy dual-script binary, and zero JavaScript source maps.
- Compressed image-content sizes reported by Docker were approximately 198 MB API, 96 MB web, 149 MB migration, and 172 MB operations.

## Encrypted isolated restore drill

The source stack received a dedicated `m9_restore_probe` row and a private MinIO marker object. The non-root operations image then:

1. created a PostgreSQL custom-format dump and MinIO mirror;
2. wrote the internal SHA-256 manifest;
3. produced one AES-256 GPG archive plus an external archive checksum;
4. verified both checksum layers during restore;
5. restored into a second PostgreSQL database and a second empty MinIO bucket on isolated temporary storage; and
6. reproduced `database-marker` and `object-marker` byte-for-byte.

Measured restore-script wall time was 1.45 seconds on this local development machine. The on-demand marker backup had effectively zero intentional RPO, but neither value is a production SLO. The drill found and fixed two container-only defects: Prisma's `schema` query parameter had to be removed before invoking libpq tools, and the MinIO client's home/configuration had to live in the script's private writable temporary directory.

The disposable containers, networks, volumes, credentials, and encrypted archive were removed after verification.

## External evidence still required

- accepted independent security assessment and remediation;
- selected production hosting, DNS/TLS, secret storage, monitoring, capacity, analytics, and final retention values;
- production-sized backup/restore retention evidence and measured RPO/RTO;
- final data reconciliation, renderer-v2 re-render, crawler/search checks, staged rollout, and accepted rollback observation window.
