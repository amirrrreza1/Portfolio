# Encrypted backup and isolated restore

The backup is one encrypted set: a PostgreSQL custom-format dump, a private-bucket object mirror, and a SHA-256 manifest. A database-only restore is incomplete because media and authoritative content references would diverge.

## Back up

Build the operations image from `infrastructure/docker/ops.Dockerfile`, mount a root-owned passphrase file read-only, and mount the backup destination. Run `/opt/portfolio/bin/backup.sh` with `DATABASE_URL`, the `MINIO_*` adapter settings, `BACKUP_PASSPHRASE_FILE`, and `BACKUP_DIR=/backups`.

Copy the resulting `.tar.gz.gpg` and `.sha256` files to access-controlled off-site storage with lifecycle retention. Keep the passphrase in a different secret system. Alert if the job fails, produces an empty archive, or misses its schedule.

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
