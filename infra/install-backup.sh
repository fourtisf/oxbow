#!/usr/bin/env bash
# Installs the daily database backup, run as root on the VPS:
#   sudo bash /home/oxbow/oxbow/infra/install-backup.sh
# Copies backup-db.sh to a root-owned path (cron must not run a file the app
# user can edit), schedules it at 03:17 server time, and takes a first backup.
# Run again after backup-db.sh changes.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root (sudo bash $0)" >&2
  exit 1
fi

install -o root -g root -m 755 "$(dirname "$0")/backup-db.sh" /usr/local/sbin/oxbow-backup-db
cat > /etc/cron.d/oxbow-backup <<'CRON'
# Daily Oxbow database backup (infra/install-backup.sh).
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
17 3 * * * root /usr/local/sbin/oxbow-backup-db >> /var/log/oxbow-backup.log 2>&1
CRON
chmod 644 /etc/cron.d/oxbow-backup

/usr/local/sbin/oxbow-backup-db | tee -a /var/log/oxbow-backup.log
echo "Backups: /var/backups/oxbow (14 days). Log: /var/log/oxbow-backup.log"
