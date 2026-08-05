# Docker and deployment specification

## 1. Scope

Docker artifacts are delivered after the application/database contracts are implemented. This document fixes the expected topology and hardening so Docker is not added as an unreviewed afterthought.

## 2. Images and services

| Service | Image/build | Network exposure | Persistent data |
| --- | --- | --- | --- |
| `web` | multi-stage Next.js standalone runtime | internal `3000`; edge only | none |
| `api` | multi-stage NestJS compiled runtime | internal `4000`; edge only | none |
| `migrate` | same application artifact or dedicated migration target | no listener; one-shot | database changes |
| `postgres` | pinned supported PostgreSQL image for local/self-hosted use | private network only | named database volume |
| `object-store` | optional pinned S3-compatible service for local/self-hosted use | private/admin network only | named object volume |
| `edge` | chosen TLS reverse proxy in self-hosted topology | public `80/443` | certificates/config as required |

Managed production PostgreSQL or object storage replaces its Compose service without changing application code. `DATABASE_URL` remains the contract.

## 3. Build rules

- Use BuildKit and a root-level build context so pnpm workspace dependencies are available.
- Pin base images by supported version and, in production automation, digest.
- Stages: dependency resolution with frozen lockfile, workspace build, production dependency pruning, minimal runtime copy.
- Cache pnpm’s content-addressable store without embedding credentials.
- Never copy `.env`, `.git`, local uploads, tests, source maps (unless secured for monitoring), package-manager caches, or development dependencies into runtime images.
- Next.js uses standalone output and includes only required workspace traces/public assets.
- API runs compiled JavaScript; TypeScript tooling and Nest CLI stay out of runtime.
- Generate an SBOM and scan final images in CI. Rebuild regularly for base-image security updates.

## 4. Runtime hardening

Every application container MUST:

- run as a fixed unprivileged UID/GID with no login shell
- use a read-only root filesystem where framework constraints allow
- mount a small `tmpfs` only for explicit temporary paths
- drop all Linux capabilities and set `no-new-privileges`
- avoid Docker socket, host network, privileged mode, host PID/IPC, and broad bind mounts
- define memory/CPU/PID limits appropriate to the host
- use an init process or correct signal handling and graceful shutdown
- log to stdout/stderr in structured form without secrets
- have a health check with bounded interval, timeout, retries, and start period

PostgreSQL/object storage run with their vendor-specific least-privilege settings and are never exposed publicly. Production administration occurs through provider/private-network mechanisms, not an open Compose port.

## 5. Networks and routing

- `edge` can reach `web` and `/api` upstream.
- `web` can reach API for server-side reads but not PostgreSQL.
- `api` can reach PostgreSQL, object storage, SMTP, and approved outbound APIs.
- PostgreSQL and object store accept only required private-service traffic.
- Browser requests use `https://site.example/api/v1`; no production credentialed cross-origin API is required.
- The edge applies request/header/body limits and TLS policy; the API repeats relevant validation.

## 6. Secrets and environment

Local Compose may read a developer `.env` ignored by Git. Production uses orchestrator/provider secrets mounted or injected at runtime.

Prohibited:

- credentials in Dockerfiles, Compose YAML, build args, image labels, repository history, or health-check command output
- `NEXT_PUBLIC_DATABASE_URL` or any browser-exposed database/storage/mail secret
- default passwords in deployed configurations
- sharing the same secret across session, CSRF, database, storage, or signing purposes

Configuration is validated before the process listens. Startup logs state only which configuration class failed, not the value.

## 7. Migrations and startup order

Database migration is a separate one-shot deployment job:

1. Back up and verify the target database when the migration risk requires it.
2. Run `prisma migrate deploy` once with migration credentials.
3. Stop deployment on failure; do not start incompatible application replicas.
4. Start/update API, wait for readiness, then web/edge.
5. Run smoke tests and content reconciliation.

Application replicas MUST NOT race by running migrations in every entrypoint. Schema changes follow expand/migrate/contract patterns for zero- or low-downtime rollout. Destructive contract steps occur only after old code is gone and backup/rollback criteria are met.

## 8. Health checks

- `GET /api/v1/health` is liveness: process/event loop can answer and returns minimal data.
- `GET /api/v1/health/ready` is readiness: required configuration, database query, and critical adapter state are usable within strict timeouts.
- Web health checks a local lightweight route and does not depend synchronously on every downstream service.
- Object/database vendor health commands use secret-safe mechanisms.
- Health endpoints are rate-limited/internal where possible and expose neither dependency details nor version information.

Compose dependency health can improve local startup but is not a substitute for application retry/backoff or orchestrator readiness.

## 9. Local development topology

The eventual `compose.yaml` supports profiles:

- `dependencies`: PostgreSQL, object storage, and a local mail catcher; web/API run with pnpm on the host.
- `full`: production-like web/API/dependencies behind the edge.
- `test`: isolated ephemeral database/object storage for integration tests.

Only the local dependency profile may publish PostgreSQL/object-store console ports to loopback. Named volumes are project-scoped and never silently deleted by routine start/stop commands.

## 10. Backup, restore, and upgrades

- Schedule encrypted PostgreSQL backups and object-version retention outside the application container.
- Define RPO/RTO after a hosting target is chosen; test restore into an isolated environment before launch and after major schema changes.
- Reconciliation checks media checksums/references, active resume, post counts/statuses, redirects, and owner access.
- Upgrade one dependency class at a time: database engine, Prisma migration, API, then web when coupling requires it.
- Rollback deploys the previous compatible images; database rollback uses a reviewed forward-fix/restore plan, never an automatic destructive downgrade.

## 11. Files to add in the Docker phase

```text
apps/web/Dockerfile
apps/api/Dockerfile
infrastructure/docker/compose.yaml
infrastructure/docker/compose.production.yaml
infrastructure/docker/Caddyfile (or selected edge config)
infrastructure/docker/.dockerignore source at repository root
infrastructure/docker/scripts/ (non-secret health/entrypoint helpers only)
```

Final file placement may adapt to the hosting provider, but the security and migration rules above remain mandatory.
