#!/bin/sh
set -eu

: "${TELEGRAM_BOT_TOKEN_FILE:?TELEGRAM_BOT_TOKEN_FILE is required}"
: "${TELEGRAM_CHAT_ID_FILE:?TELEGRAM_CHAT_ID_FILE is required}"

backup_dir=${BACKUP_DIR:-/backups}
retention_days=${BACKUP_RETENTION_DAYS:-30}
max_file_bytes=${TELEGRAM_MAX_FILE_BYTES:-45000000}
upload_retries=${TELEGRAM_UPLOAD_RETRIES:-4}

case "$retention_days:$max_file_bytes:$upload_retries" in
  *[!0-9:]* | :* | *::* | *:) echo "Backup numeric settings must be positive integers." >&2; exit 2 ;;
esac
if [ "$retention_days" -lt 1 ] || [ "$max_file_bytes" -lt 1000000 ] || [ "$upload_retries" -lt 1 ]; then
  echo "Invalid backup retention, Telegram size, or retry setting." >&2
  exit 2
fi

test -r "$TELEGRAM_BOT_TOKEN_FILE"
test -r "$TELEGRAM_CHAT_ID_FILE"
telegram_token=$(tr -d '\r\n' < "$TELEGRAM_BOT_TOKEN_FILE")
telegram_chat_id=$(tr -d '\r\n' < "$TELEGRAM_CHAT_ID_FILE")
case "$telegram_token" in
  '' | *[!A-Za-z0-9:_-]*) echo "Telegram bot token file is empty or malformed." >&2; exit 2 ;;
esac
if ! printf '%s\n' "$telegram_chat_id" | grep -Eq '^-?[0-9]+$'; then
  echo "Telegram chat ID must be numeric." >&2
  exit 2
fi

if [ "${BACKUP_LOCK_HELD:-false}" != "true" ]; then
  export BACKUP_LOCK_HELD=true
  exec flock -n /tmp/portfolio-backup.lock "$0" "$@"
fi

umask 077
work_dir=$(mktemp -d /tmp/portfolio-telegram.XXXXXX)
trap 'rm -rf "$work_dir"' EXIT HUP INT TERM

archive=$(/opt/portfolio/bin/backup.sh)
test -s "$archive"
test -s "$archive.sha256"
archive_name=$(basename "$archive")
archive_size=$(wc -c < "$archive" | tr -d ' ')

# Local retention is independent from delivery. A failed upload leaves the new
# archive in the persistent volume for manual recovery and a later send.
find "$backup_dir" -maxdepth 1 -type f \
  \( -name 'portfolio-*.tar.gz.gpg' -o -name 'portfolio-*.tar.gz.gpg.sha256' \) \
  -mtime "+$retention_days" -delete

curl_config="$work_dir/curl.conf"
printf 'url = "https://api.telegram.org/bot%s/sendDocument"\n' "$telegram_token" > "$curl_config"

upload_document() {
  document=$1
  caption=$2
  response="$work_dir/telegram-response.json"
  curl --config "$curl_config" \
    --silent --show-error --fail-with-body \
    --retry "$upload_retries" --retry-all-errors --retry-delay 5 \
    --form-string "chat_id=$telegram_chat_id" \
    --form-string "caption=$caption" \
    --form "document=@$document" > "$response"
  jq -e '.ok == true' "$response" >/dev/null
}

if [ "$archive_size" -le "$max_file_bytes" ]; then
  upload_document "$archive" "Nightly portfolio backup: $archive_name"
else
  parts_dir="$work_dir/parts"
  mkdir -p "$parts_dir"
  split -b "$max_file_bytes" -d -a 4 "$archive" "$parts_dir/$archive_name.part-"
  part_count=$(find "$parts_dir" -type f | wc -l | tr -d ' ')
  part_number=0
  for part in "$parts_dir"/*; do
    part_number=$((part_number + 1))
    upload_document "$part" "Portfolio backup $archive_name — part $part_number/$part_count"
  done
fi

upload_document "$archive.sha256" "SHA-256 for $archive_name"
touch "$backup_dir/.last-success"
printf 'Backup created and delivered to Telegram: %s\n' "$archive"
