# Docker assets

M9 provides the production-like topology here:

- `compose.yaml` defines dependencies, the one-shot migration, API/web, publication, scheduler, maintenance, and edge services with private networks and hardened application containers.
- `compose.production.yaml` supplies production restart behavior without publishing PostgreSQL or MinIO ports.
- `Caddyfile` is the edge baseline.
- `ops.Dockerfile` and `scripts/` provide encrypted PostgreSQL/MinIO backup and guarded isolated restore.

Supply `.env.compose.example` values from an ignored secret source or an orchestrator. Never deploy the example values. See `docs/DOCKER.md` and the runbooks for verification and rollout order.
