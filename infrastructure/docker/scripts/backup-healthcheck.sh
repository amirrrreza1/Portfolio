#!/bin/sh
set -eu

backup_dir=${BACKUP_DIR:-/backups}
max_age_minutes=${BACKUP_HEALTH_MAX_AGE_MINUTES:-1560}
case "$max_age_minutes" in
  '' | *[!0-9]*) exit 2 ;;
esac
if [ "$max_age_minutes" -lt 1 ]; then
  exit 2
fi

marker="$backup_dir/.last-success"
if [ ! -e "$marker" ]; then
  marker="$backup_dir/.scheduler-started"
fi
test -f "$marker"
find "$marker" -mmin "-$max_age_minutes" -print -quit | grep -q .
