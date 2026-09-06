#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
compose_env_file=${COMPOSE_ENV_FILE:-$script_dir/.env.compose}
compose() {
  docker compose \
    --env-file "$compose_env_file" \
    -f "$script_dir/compose.yaml" \
    -f "$script_dir/compose.production.yaml" \
    --profile full "$@"
}

usage() {
  echo "Usage: $0 list | create | download [archive-name] [destination]" >&2
  exit 2
}

action=${1:-}
case "$action" in
  list)
    compose exec -T backup /opt/portfolio/bin/backup-list.sh
    ;;
  create)
    compose exec -T backup /opt/portfolio/bin/backup-and-notify.sh
    ;;
  download)
    archive_name=${2:-}
    destination=${3:-$script_dir/downloads}
    if [ -z "$archive_name" ]; then
      archive_name=$(compose exec -T backup /opt/portfolio/bin/backup-list.sh | sed -n '1p')
    fi
    case "$archive_name" in
      portfolio-????????T??????Z.tar.gz.gpg) ;;
      *) echo "No backup found, or the archive name is invalid." >&2; exit 2 ;;
    esac
    mkdir -p "$destination"
    if [ -e "$destination/$archive_name" ] || [ -e "$destination/$archive_name.sha256" ]; then
      echo "Refusing to overwrite an existing downloaded backup." >&2
      exit 2
    fi
    compose cp "backup:/backups/$archive_name" "$destination/$archive_name"
    compose cp "backup:/backups/$archive_name.sha256" "$destination/$archive_name.sha256"
    echo "Downloaded $archive_name and its checksum to $destination"
    ;;
  *) usage ;;
esac
