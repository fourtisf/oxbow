#!/usr/bin/env bash
# Daily PostgreSQL backup of the Oxbow database, kept for 14 days.
# infra/install-backup.sh installs a root-owned copy to
# /usr/local/sbin/oxbow-backup-db and runs it from cron.
set -euo pipefail

DB="${DB:-oxbow}"
DIR="${BACKUP_DIR:-/var/backups/oxbow}"
KEEP_DAYS="${KEEP_DAYS:-14}"

umask 077
mkdir -p "$DIR"
stamp="$(date -u +%Y%m%d-%H%M%S)"
tmp="$DIR/.oxbow-$stamp.dump.part"
out="$DIR/oxbow-$stamp.dump"
trap 'rm -f "$tmp"' EXIT

runuser -u postgres -- pg_dump --format=custom --no-owner "$DB" > "$tmp"
# A dump that can't be read back is not a backup.
pg_restore --list "$tmp" > /dev/null
mv "$tmp" "$out"
find "$DIR" -maxdepth 1 -name 'oxbow-*.dump' -mtime +"$KEEP_DAYS" -delete

echo "$(date -u +%FT%TZ) backup ok: $out ($(du -h "$out" | cut -f1))"
