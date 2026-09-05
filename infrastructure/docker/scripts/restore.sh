#!/bin/sh
set -eu

: "${RESTORE_ARCHIVE:?RESTORE_ARCHIVE is required}"
: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required}"
: "${RESTORE_MINIO_ENDPOINT:?RESTORE_MINIO_ENDPOINT is required}"
: "${RESTORE_MINIO_BUCKET:?RESTORE_MINIO_BUCKET is required}"
: "${RESTORE_MINIO_ACCESS_KEY_ID:?RESTORE_MINIO_ACCESS_KEY_ID is required}"
: "${RESTORE_MINIO_SECRET_ACCESS_KEY:?RESTORE_MINIO_SECRET_ACCESS_KEY is required}"
: "${BACKUP_PASSPHRASE_FILE:?BACKUP_PASSPHRASE_FILE is required}"

if [ "${RESTORE_TARGET_ISOLATED:-}" != "true" ]; then
  echo "Refusing restore: set RESTORE_TARGET_ISOLATED=true for the verified isolated target." >&2
  exit 2
fi
test -r "$RESTORE_ARCHIVE"
test -r "$RESTORE_ARCHIVE.sha256"
test -r "$BACKUP_PASSPHRASE_FILE"
sha256sum -c "$RESTORE_ARCHIVE.sha256"

umask 077
work_dir=$(mktemp -d /tmp/portfolio-restore.XXXXXX)
trap 'rm -rf "$work_dir"' EXIT HUP INT TERM
gpg --batch --yes --quiet --pinentry-mode loopback \
  --passphrase-file "$BACKUP_PASSPHRASE_FILE" \
  --decrypt --output "$work_dir/payload.tar.gz" "$RESTORE_ARCHIVE"
tar -xzf "$work_dir/payload.tar.gz" -C "$work_dir"
(
  cd "$work_dir"
  sha256sum -c MANIFEST.sha256
)

pg_restore --dbname="$RESTORE_DATABASE_URL" --clean --if-exists --no-owner --no-privileges "$work_dir/postgres.dump"
mc alias set restore-store "$RESTORE_MINIO_ENDPOINT" "$RESTORE_MINIO_ACCESS_KEY_ID" "$RESTORE_MINIO_SECRET_ACCESS_KEY" >/dev/null
mc mb --ignore-existing "restore-store/$RESTORE_MINIO_BUCKET" >/dev/null
if [ "${RESTORE_ALLOW_OBJECT_DELETE:-}" = "true" ]; then
  mc mirror --overwrite --remove "$work_dir/objects" "restore-store/$RESTORE_MINIO_BUCKET" >/dev/null
else
  mc mirror --overwrite "$work_dir/objects" "restore-store/$RESTORE_MINIO_BUCKET" >/dev/null
fi
echo "Restore completed. Run pnpm --filter @portfolio/api verify:restore against this isolated target."
