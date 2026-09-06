# Docker assets

M9 provides the production-like topology here:

- `compose.yaml` defines dependencies, the one-shot migration, API/web, publication, scheduler, maintenance, nightly backup, and edge services with private networks and hardened containers.
- `compose.production.yaml` supplies production restart behavior without publishing PostgreSQL or MinIO ports.
- `Caddyfile` is the edge baseline.
- `ops.Dockerfile` and `scripts/` provide encrypted PostgreSQL/MinIO backup, nightly Telegram delivery, local retention, and guarded isolated restore.
- `backupctl.sh` and `backupctl.ps1` list backups, trigger one immediately, or download the newest/specified encrypted archive and checksum from the Compose volume.

Supply `.env.compose.example` values from an ignored secret source or an orchestrator. Never deploy the example values. See `docs/DOCKER.md` and the runbooks for verification and rollout order.
