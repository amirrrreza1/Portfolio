# Docker and deployment specification

## 1. Scope

Docker artifacts are delivered after the application/database contracts are implemented. This document fixes the expected topology and hardening so Docker is not added as an unreviewed afterthought.

## 2. Images and services

| Service | Image/build | Network exposure | Persistent data |
| --- | --- | --- | --- |
| `web` | multi-stage Next.js standalone runtime | internal `3000`; edge only | none |
| `api` | multi-stage NestJS compiled runtime | internal `4000`; edge only | none |
| `migrate` | same application artifact or dedicated migration target | no listener; one-shot | database changes |
| `scheduler` | same application artifact, scheduler entrypoint | no listener | none; holds a database advisory lock |
| `postgres` | pinned supported PostgreSQL image for local/self-hosted use | private network only | named database volume |
| `minio` | pinned MinIO service for local/self-hosted use | private/admin network only | named MinIO volume |
| `edge` | chosen TLS reverse proxy in self-hosted topology | public `80/443` | certificates/config as required |

The MinIO deployment uses the same private adapter contract in local and production environments. `DATABASE_URL` remains the database contract; MinIO settings are server-only `MINIO_*` configuration.

## 3. Build rules

- Use BuildKit and a root-level build context so pnpm workspace dependencies are available.
- Pin base images by supported version and, in production automation, digest.
- Stages: dependency resolution with frozen lockfile, workspace build, production dependency pruning, minimal runtime copy.
- Cache pnpm’s content-addressable store without embedding credentials.
- Never copy `.env`, `.git`, `content/`, local uploads, tests, source maps (unless secured for monitoring), package-manager caches, or development dependencies into runtime images. `content/` is data fetched through the Git API at runtime, not build input; baking it into an image would create a stale second copy with unclear authority.
- Next.js uses standalone output (`output: "standalone"`, which the current empty `next.config.ts` does not set) and includes only required workspace traces/public assets.
- Only the `woff2` font files actually referenced by the appearance registry are copied into the image. The `.eot`, `.ttf`, and `.woff` duplicates are not shipped.
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

PostgreSQL and MinIO run with least-privilege settings and are never exposed publicly. Production administration occurs through private-network mechanisms, not an open Compose port.

## 5. Networks and routing

- `edge` can reach `web` and `/api` upstream, and routes `/webhooks/content-git` to the API with its own stricter body-size and rate limits.
- `web` can reach API for server-side reads but not PostgreSQL and not the Git host.
- `api` can reach PostgreSQL, MinIO, SMTP, the Git host, and approved outbound APIs. Outbound access to the Git host is an explicit allowlist entry, not open egress.
- `scheduler` can reach PostgreSQL and the API/Git host but accepts no inbound traffic.
- PostgreSQL and MinIO accept only required private-service traffic.
- Browser requests use `https://site.example/api/v1`; no production credentialed cross-origin API is required.
- The edge applies request/header/body limits and TLS policy; the API repeats relevant validation.

## 6. Secrets and environment

Local Compose may read a developer `.env` ignored by Git. Production uses orchestrator/provider secrets mounted or injected at runtime.

The Git App private key and webhook secret are mounted as runtime secrets or files, never build arguments. The key is readable only by the API user.

Prohibited:

- credentials in Dockerfiles, Compose YAML, build args, image labels, repository history, or health-check command output
- `NEXT_PUBLIC_DATABASE_URL` or any browser-exposed database/storage/mail/Git secret
- the Git credential in the `web` or `scheduler` image environment when those processes do not need it
- default passwords in deployed configurations
- sharing the same secret across session, CSRF, database, storage, Git webhook, or cache-invalidation signing purposes

Configuration is validated before the process listens. Startup logs state only which configuration class failed, not the value.

## 7. Migrations and startup order

Database migration is a separate one-shot deployment job:

1. Back up and verify the target database when the migration risk requires it.
2. Run `prisma migrate deploy` once with migration credentials.
3. Stop deployment on failure; do not start incompatible application replicas.
4. Start/update API, wait for readiness, then web/edge.
5. Run smoke tests and content reconciliation.

Application replicas MUST NOT race by running migrations in every entrypoint. Schema changes follow expand/migrate/contract patterns for zero- or low-downtime rollout. Destructive contract steps occur only after old code is gone and backup/rollback criteria are met.

Two more single-instance rules follow from the content pipeline:

- **Exactly one scheduler.** Whether it is a platform cron trigger or the `scheduler` service, scheduled publication MUST NOT fire once per API replica. When it runs in-process, a PostgreSQL advisory lock enforces the single instance.
- **Content sync is serialized per post.** Multiple API replicas may receive webhooks; the work is queued and locked per post so two syncs cannot interleave on one translation.

After a deployment that changes the render pipeline, bump `rendererVersion` rather than clearing the cache manually. Content re-renders on next access from Git, which is the safe rollout path for a sanitizer or highlighter upgrade.

## 8. Health checks

- `GET /api/v1/health` is liveness: process/event loop can answer and returns minimal data.
- `GET /api/v1/health/ready` is readiness: required configuration, database query, and critical adapter state are usable within strict timeouts.
- **Git-host reachability is NOT part of readiness.** Public reads never touch Git, so a Git outage must not remove a healthy replica from rotation. Content-store health is reported on the admin dashboard and through monitoring instead.
- Web health checks a local lightweight route and does not depend synchronously on every downstream service.
- Object/database vendor health commands use secret-safe mechanisms.
- Health endpoints are rate-limited/internal where possible and expose neither dependency details nor version information.

Compose dependency health can improve local startup but is not a substitute for application retry/backoff or orchestrator readiness.

## 9. Local development topology

The eventual `compose.yaml` supports profiles:

- `dependencies`: PostgreSQL, MinIO, and a local mail catcher; web/API run with pnpm on the host.
- `full`: production-like web/API/dependencies behind the edge.
- `test`: isolated ephemeral PostgreSQL/MinIO resources for integration tests.

Only the local dependency profile may publish PostgreSQL/MinIO console ports to loopback. Named volumes are project-scoped and never silently deleted by routine start/stop commands.

## 10. Backup, restore, and upgrades

- Schedule encrypted PostgreSQL backups and object-version retention outside the application container.
- Article bodies have an independent recovery path in the content repository; a mirror clone is kept outside the Git host so provider loss is survivable.
- Define RPO/RTO after a hosting target is chosen; test restore into an isolated environment before launch and after major schema changes.
- Reconciliation checks media checksums/references, active resume, post/translation counts and statuses, every recorded blob SHA against the repository, redirects, and owner access. A restore is not valid until it reports zero unexplained differences.
- Upgrade one dependency class at a time: database engine, Prisma migration, API, then web when coupling requires it.
- Rollback deploys the previous compatible images; database rollback uses a reviewed forward-fix/restore plan, never an automatic destructive downgrade.

## 11. Files to add in the Docker phase

```text
apps/web/Dockerfile
apps/api/Dockerfile
infrastructure/docker/compose.yaml
infrastructure/docker/compose.production.yaml
infrastructure/docker/Caddyfile (or selected edge config)
infrastructure/docker/.dockerignore source at repository root  # must exclude content/ and .git
infrastructure/docker/scripts/ (non-secret health/entrypoint helpers only)
```

Final file placement may adapt to the hosting provider, but the security and migration rules above remain mandatory.
