#!/usr/bin/env bash
# One-time data setup for the API, run as root on the VPS:
#   sudo bash /home/oxbow/oxbow/infra/setup-data.sh
# Installs PostgreSQL and Redis (both listen on localhost only), creates the
# "oxbow" database with a random password, and writes apps/api/.env for the
# app user. Safe to run again: existing users, databases and env files are kept.
set -euo pipefail

APP_USER="${APP_USER:-oxbow}"
APP_DIR="${APP_DIR:-/home/$APP_USER/oxbow}"
ENV_FILE="$APP_DIR/apps/api/.env"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root (sudo bash $0)" >&2
  exit 1
fi
[ -d "$APP_DIR/apps/api" ] || { echo "No checkout at $APP_DIR" >&2; exit 1; }

apt-get update -y
apt-get install -y postgresql redis-server
systemctl enable --now postgresql redis-server

if [ -f "$ENV_FILE" ]; then
  echo "$ENV_FILE already exists; leaving it and the database password as they are."
else
  pass="$(openssl rand -hex 24)"
  if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname = 'oxbow'" | grep -q 1; then
    sudo -u postgres psql -q -c "ALTER ROLE oxbow WITH LOGIN PASSWORD '$pass'"
  else
    sudo -u postgres psql -q -c "CREATE ROLE oxbow WITH LOGIN PASSWORD '$pass'"
  fi
  if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname = 'oxbow'" | grep -q 1; then
    sudo -u postgres createdb -O oxbow oxbow
  fi
  umask 077
  cat > "$ENV_FILE" <<ENV
DATABASE_URL=postgresql://oxbow:$pass@127.0.0.1:5432/oxbow
REDIS_URL=redis://127.0.0.1:6379
RPC_URL=
OXBOW_TREASURY=
OXBOW_FEE_BPS=50
PORT=4000
HOST=127.0.0.1
LOG_LEVEL=info
ENV
  chown "$APP_USER:$APP_USER" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "Wrote $ENV_FILE (database password generated, not shown)."
fi

echo "Done. Next: put your RPC URL in RPC_URL and your fee wallet in OXBOW_TREASURY (nano $ENV_FILE), then run the deploy as $APP_USER."
