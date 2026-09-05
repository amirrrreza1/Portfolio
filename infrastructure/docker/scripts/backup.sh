#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${MINIO_ENDPOINT:?MINIO_ENDPOINT is required}"
: "${MINIO_BUCKET:?MINIO_BUCKET is required}"
: "${MINIO_ACCESS_KEY_ID:?MINIO_ACCESS_KEY_ID is required}"
: "${MINIO_SECRET_ACCESS_KEY:?MINIO_SECRET_ACCESS_KEY is required}"
: "${BACKUP_PASSPHRASE_FILE:?BACKUP_PASSPHRASE_FILE is required}"

backup_dir=${BACKUP_DIR:-/backups}
test -r "$BACKUP_PASSPHRASE_FILE"
mkdir -p "$backup_dir"
umask 077
work_dir=$(mktemp -d /tmp/portfolio-backup.XXXXXX)
trap 'rm -rf "$work_dir"' EXIT HUP INT TERM
stamp=$(date -u +%Y%m%dT%H%M%SZ)

pg_dump --dbname="$DATABASE_URL" --format=custom --compress=9 --file="$work_dir/postgres.dump"
mc alias set backup-store "$MINIO_ENDPOINT" "$MINIO_ACCESS_KEY_ID" "$MINIO_SECRET_ACCESS_KEY" >/dev/null
mkdir -p "$work_dir/objects"
mc mirror --overwrite "backup-store/$MINIO_BUCKET" "$work_dir/objects" >/dev/null

(
  cd "$work_dir"
  find postgres.dump objects -type f -print0 | sort -z | xargs -0 sha256sum > MANIFEST.sha256
  tar -czf payload.tar.gz MANIFEST.sha256 postgres.dump objects
)

archive="$backup_dir/portfolio-$stamp.tar.gz.gpg"
gpg --batch --yes --quiet --pinentry-mode loopback \
  --passphrase-file "$BACKUP_PASSPHRASE_FILE" \
  --symmetric --cipher-algo AES256 --output "$archive" "$work_dir/payload.tar.gz"
sha256sum "$archive" > "$archive.sha256"
printf '%s\n' "$archive"
