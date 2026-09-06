# Encrypted backup and isolated restore

The backup is one encrypted set: a PostgreSQL custom-format dump, a private-bucket object mirror, and a SHA-256 manifest. A database-only restore is incomplete because media and authoritative content references would diverge.

## Back up

Build the operations image from `infrastructure/docker/ops.Dockerfile`, mount a root-owned passphrase file read-only, and mount a backup destination writable by container UID/GID `10001:10001`. Run `/opt/portfolio/bin/backup.sh` with `DATABASE_URL`, the `MINIO_*` adapter settings, `BACKUP_PASSPHRASE_FILE`, and `BACKUP_DIR=/backups`. The image pins the PostgreSQL 17 client to the server major and keeps the MinIO client configuration in an ephemeral private directory.

Copy the resulting `.tar.gz.gpg` and `.sha256` files to access-controlled off-site storage with lifecycle retention. Keep the passphrase in a different secret system. Alert if the job fails, produces an empty archive, or misses its schedule.

### Compose nightly backup and Telegram delivery

The `backup` service runs continuously with no inbound network, creates one encrypted PostgreSQL/MinIO backup each night, retains it in the `backup-data` volume, and sends it to the configured Telegram chat. Set `BACKUP_TIME_ZONE` and `BACKUP_TIME` (`HH:MM`) in the Compose environment. `BACKUP_RUN_ON_START=true` is useful for the first deployment proof; normally leave it false to avoid a new archive on every container restart. A successful archive and Telegram delivery updates a persistent health marker; the container becomes unhealthy after `BACKUP_HEALTH_MAX_AGE_MINUTES` without success (26 hours by default).

Before starting the full profile, create these ignored files under `infrastructure/docker/secrets/` (or override their paths):

- `backup-passphrase`: a long unique passphrase kept separately from downloaded archives;
- `telegram-bot-token`: the token issued for the dedicated backup bot;
- `telegram-chat-id`: the numeric private chat or group ID that has already messaged/added the bot.

Restrict the files to the deployment administrator. Start the production topology with both Compose files; the `full` profile includes the backup service. Confirm its next run with `docker compose ... logs backup`. Each successful delivery sends the encrypted archive followed by its SHA-256 file. Archives larger than `TELEGRAM_MAX_FILE_BYTES` are sent as ordered `.part-0000` files; concatenate them in lexical order before checking the original `.sha256` file and restoring.

Telegram is a delivery convenience, not the only acceptable off-site backup system: chat deletion, bot revocation, provider limits, or account loss can remove access. Retain another access-controlled off-site copy for the production recovery gate.

### Manual operations

From the repository, use the helper matching the host:

```sh
# Linux/macOS
./infrastructure/docker/backupctl.sh list
./infrastructure/docker/backupctl.sh create
./infrastructure/docker/backupctl.sh download
./infrastructure/docker/backupctl.sh download portfolio-YYYYMMDDTHHMMSSZ.tar.gz.gpg /safe/destination
```

```powershell
# Windows PowerShell
.\infrastructure\docker\backupctl.ps1 list
.\infrastructure\docker\backupctl.ps1 create
.\infrastructure\docker\backupctl.ps1 download
.\infrastructure\docker\backupctl.ps1 download portfolio-YYYYMMDDTHHMMSSZ.tar.gz.gpg D:\safe\destination
```

`download` without a name selects the newest archive. It copies both the encrypted archive and checksum and refuses to overwrite an existing download. `create` runs immediately in the existing backup container, uses the same exclusive lock as the nightly job, and also delivers the result to Telegram.

Both helpers read `infrastructure/docker/.env.compose` by default. Set `COMPOSE_ENV_FILE` to an alternate deployment environment-file path when needed.

## Restore drill

1. Provision an isolated PostgreSQL database and empty MinIO bucket with credentials that cannot reach production.
2. Set `RESTORE_TARGET_ISOLATED=true`. The restore script refuses to run without this explicit guard.
3. Run `/opt/portfolio/bin/restore.sh` with `RESTORE_ARCHIVE`, `RESTORE_DATABASE_URL`, `RESTORE_MINIO_*`, and the passphrase file. Set `RESTORE_ALLOW_OBJECT_DELETE=true` only when the isolated bucket is dedicated to this drill.
4. Point the application environment at the isolated targets and run `pnpm --filter @portfolio/api verify:restore`. It re-renders every stored article, verifies source and object SHA-256 values and byte sizes, checks the active-resume invariant, and reports counts.
5. Run the bilingual release smoke and browser suites against the isolated stack.
6. Compare the verifier counts to the backup’s recorded run report. Zero unexplained differences is the only passing result.
7. Destroy the isolated credentials and retain the dated command output, RPO, and measured RTO.

## Repository mirror

The Git repository contains code and migrations, not authoritative article bodies. Mirror all refs to an independently controlled remote with `git clone --mirror` followed by scheduled `git remote update --prune` and `git push --mirror <independent-remote>`. Protect the mirror credentials separately from deployment credentials and test a clone from it during the restore drill.
