#!/usr/bin/env bash
set -euo pipefail

umask 077

project_dir="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$project_dir"

if [[ ! -f .migration.env ]]; then
  echo "Missing .migration.env; backups require the administrator database connection." >&2
  exit 1
fi

set -a
source .migration.env
if [[ -f .backup.env ]]; then
  source .backup.env
fi
set +a

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${DATABASE_CA_CERT_PEM:?DATABASE_CA_CERT_PEM is required}"

retention_days="${BACKUP_RETENTION_DAYS:-7}"
if ! [[ "$retention_days" =~ ^[1-9][0-9]*$ ]]; then
  echo "BACKUP_RETENTION_DAYS must be a positive integer." >&2
  exit 1
fi

backup_dir="$project_dir/backups"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_name="catcode-license-${timestamp}.dump"
backup_path="$backup_dir/$backup_name"
certificate_dir="$(mktemp -d)"
trap 'rm -rf "$certificate_dir"' EXIT
printf '%b\n' "$DATABASE_CA_CERT_PEM" > "$certificate_dir/supabase-ca.crt"
chmod 600 "$certificate_dir/supabase-ca.crt"

docker run --rm \
  --env DATABASE_URL \
  --env PGSSLMODE=verify-full \
  --env PGSSLROOTCERT=/certs/supabase-ca.crt \
  --env BACKUP_NAME="$backup_name" \
  -v "$certificate_dir:/certs:ro" \
  -v "$backup_dir:/backups" \
  postgres:17-alpine \
  sh -ec 'pg_dump "$DATABASE_URL" --format=custom --compress=9 --no-owner --no-privileges --file "/backups/$BACKUP_NAME"'

test -s "$backup_path"
chmod 600 "$backup_path"
find "$backup_dir" -type f -name 'catcode-license-*.dump' -mtime "+$retention_days" -delete

if [[ -n "${BACKUP_RCLONE_REMOTE:-}" ]]; then
  command -v rclone >/dev/null || {
    echo "BACKUP_RCLONE_REMOTE is configured but rclone is not installed." >&2
    exit 1
  }
  rclone copy --immutable "$backup_path" "$BACKUP_RCLONE_REMOTE"
elif [[ "${REQUIRE_OFFSITE_BACKUP:-true}" == "true" ]]; then
  echo "Offsite backup is required: configure BACKUP_RCLONE_REMOTE in .backup.env." >&2
  exit 1
fi

echo "Backup completed: $backup_name"
