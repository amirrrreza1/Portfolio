#!/bin/sh
set -eu

backup_dir=${BACKUP_DIR:-/backups}
find "$backup_dir" -maxdepth 1 -type f -name 'portfolio-*.tar.gz.gpg' -printf '%f\n' | sort -r
