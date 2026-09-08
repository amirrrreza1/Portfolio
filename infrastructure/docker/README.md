# Docker assets

M9 provides the production-like topology here:

- `compose.yaml` defines dependencies, the one-shot migration, API/web, publication, scheduler, maintenance, nightly backup, and edge services with private networks and hardened containers.
- `compose.production.yaml` supplies production restart behavior without publishing PostgreSQL or MinIO ports.
- `compose.host-caddy.yaml` publishes only the web service on a configurable loopback port for servers that already run Caddy on the host.
- `Caddyfile` is the edge baseline.
- `ops.Dockerfile` and `scripts/` provide encrypted PostgreSQL/MinIO backup, nightly Telegram delivery, local retention, and guarded isolated restore.
- `backupctl.sh` and `backupctl.ps1` list backups, trigger one immediately, or download the newest/specified encrypted archive and checksum from the Compose volume.

Supply `.env.compose.example` values from an ignored secret source or an orchestrator. Never deploy the example values. See `docs/DOCKER.md` and the runbooks for verification and rollout order.

On a host that already owns ports 80/443, start the stack without the bundled
`edge` service and add the host-Caddy override:

```sh
docker compose \
  --env-file infrastructure/docker/.env.compose \
  -f compose.yaml \
  -f infrastructure/docker/compose.host-caddy.yaml \
  up -d --build \
  postgres minio minio-init migrate api publication scheduler maintenance backup web
```

The default upstream is `127.0.0.1:3010`; set `PORTFOLIO_HTTP_PORT` in the
environment file to choose another loopback port. Configure the host Caddyfile
to reverse proxy the public site to that upstream.
