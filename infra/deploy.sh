#!/usr/bin/env bash
# Updates the running site: pulls the branch, installs, builds, then reloads
# the app (PM2 keeps serving the old build until the new one is up).
# Run as the app user: bash ~/oxbow/infra/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

git pull --ff-only
pnpm install --frozen-lockfile
pnpm --filter @oxbow/web build
pm2 startOrReload infra/ecosystem.config.cjs --update-env
pm2 save
echo "Deployed $(git rev-parse --short HEAD)"
