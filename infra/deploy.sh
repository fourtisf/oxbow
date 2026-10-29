#!/usr/bin/env bash
# Updates the running site: pulls the branch, installs, applies database
# migrations, builds, then reloads the web app and the API (PM2 keeps serving
# the old build until the new one is up).
# Run as the app user: sudo -iu oxbow bash /home/oxbow/oxbow/infra/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

git pull --ff-only
pnpm install --frozen-lockfile
# Prisma client (also a postinstall step; explicit in case install scripts were skipped).
pnpm --filter @oxbow/db generate

if [ -f apps/api/.env ]; then
  # Only the database URL, without sourcing the whole file (values may hold shell characters).
  db_url="$(grep -E '^DATABASE_URL=' apps/api/.env | head -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
  DATABASE_URL="$db_url" pnpm --filter @oxbow/db migrate:deploy
fi

pnpm --filter @oxbow/web build
pm2 startOrReload infra/ecosystem.config.cjs --update-env
pm2 save
echo "Deployed $(git rev-parse --short HEAD)"
