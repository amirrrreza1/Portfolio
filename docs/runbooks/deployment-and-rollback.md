# Deployment and rollback

## Preconditions

- Use an immutable revision and reviewed image digests.
- Confirm the encrypted PostgreSQL and object backup completed and its archive checksum verifies.
- Keep the previous compatible image tags available.
- Supply every value in `infrastructure/docker/.env.compose.example` from the deployment secret store. Never commit the populated file.
- Do not expose `/admin` until the independent review required by `SECURITY.md` §15 is accepted.

## Deploy

1. Render the final topology with `docker compose --env-file <secret-env> -f infrastructure/docker/compose.yaml -f infrastructure/docker/compose.production.yaml --profile full config` and inspect it for published data-service ports or unexpected mounts.
2. Build by digest. CI must have produced clean Trivy scans and retained SPDX SBOMs for the same revision.
3. Run only the `migrate` service. It applies `prisma migrate deploy` once and must finish successfully before application services start.
4. Run `docker compose run --rm --no-deps api node dist/operations/rerender-articles.js` and review the plan. Run it again with `--apply`; renderer migrations are source-digest guarded, optimistic, and idempotent.
5. Start `api`; wait for `/api/v1/health/ready` to report database and storage `ok`.
6. Start one logical `publication`, `scheduler`, and `maintenance` service. PostgreSQL advisory locks are the second line of defense against accidental duplication.
7. Start `web`, then `edge`.
8. Run `RELEASE_BASE_URL=https://target.example pnpm release:smoke`, the bilingual browser suite, and the article/media integrity verifier.
9. Observe error rate, contact delivery failures, publication dead letters, invalidation failures, database saturation, storage capacity, and latency throughout the agreed rollback window.

## Roll back application code

1. Stop rollout and preserve logs, request IDs, and failed-job state.
2. If the schema is backward compatible, redeploy the previous immutable web/API/worker images; never run a reverse migration automatically.
3. Run the smoke and integrity checks again.
4. If the schema or data is incompatible, isolate the environment and follow the backup/restore runbook. Restore both PostgreSQL and object storage from the same backup set.
5. Record the decision, timestamps, image digests, migration state, and verification output.

Legacy JSON reads and old client packages may be removed only after this rollback window is accepted.
