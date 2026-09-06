#!/bin/sh
set -eu

backup_time=${BACKUP_TIME:-02:00}
backup_dir=${BACKUP_DIR:-/backups}
case "$backup_time" in
  [0-1][0-9]:[0-5][0-9] | 2[0-3]:[0-5][0-9]) ;;
  *) echo "BACKUP_TIME must use 24-hour HH:MM format." >&2; exit 2 ;;
esac

mkdir -p "$backup_dir"
touch "$backup_dir/.scheduler-started"

run_backup() {
  if /opt/portfolio/bin/backup-and-notify.sh; then
    printf 'Nightly backup completed at %s.\n' "$(date --iso-8601=seconds)"
  else
    status=$?
    printf 'Nightly backup failed with status %s at %s.\n' "$status" "$(date --iso-8601=seconds)" >&2
  fi
}

if [ "${BACKUP_RUN_ON_START:-false}" = "true" ]; then
  run_backup
fi

while :; do
  now_epoch=$(date +%s)
  today=$(date +%F)
  target_epoch=$(date -d "$today $backup_time:00" +%s)
  if [ "$target_epoch" -le "$now_epoch" ]; then
    target_epoch=$(date -d "tomorrow $backup_time:00" +%s)
  fi
  wait_seconds=$((target_epoch - now_epoch))
  printf 'Next backup scheduled for %s (%s, in %s seconds).\n' \
    "$(date -d "@$target_epoch" --iso-8601=seconds)" "${TZ:-UTC}" "$wait_seconds"
  sleep "$wait_seconds"
  run_backup
done
