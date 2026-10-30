# infra

Deployment for the VPS (Ubuntu 24.04) serving **oxbowflow.com**. DNS: an `A`
record for `@` pointing at the server and a `CNAME` for `www` pointing at
`oxbowflow.com`.

- `nginx/oxbowflow.conf`: public entry point. `/api/` goes to the API on
  `127.0.0.1:4000` (the live trade stream unbuffered), everything else to
  the web app on `127.0.0.1:3000`. Overwrites `X-Forwarded-For` (both apps
  rate-limit by it) and drops any client-sent `CF-IPCountry` (the region
  notice trusts it; set it here from GeoIP2 if you turn region blocking on).
  Certbot adds HTTPS on top.
- `ecosystem.config.cjs`: PM2 processes `oxbow-web` (`next start`) and, once
  `apps/api/.env` exists, `oxbow-api` (Fastify through tsx) and `oxbow-worker`
  (the wallet tracker), all on localhost.
- `setup-data.sh`: one-time PostgreSQL + Redis install, `oxbow` database with
  a generated password, `apps/api/.env`.
- `deploy.sh`: update in one step: pull, install, database migrations, build,
  reload, save.
- `backup-db.sh` + `install-backup.sh`: daily database backups (below).

## First install (summary)

1. As root: system updates, swap if the server has 2 GB of RAM or less (the
   build peaks around 1.1 GB), Node 22, `pnpm@10.28.0` and `pm2` globally,
   Nginx, Certbot, UFW allowing OpenSSH and Nginx.
2. Create an unprivileged `oxbow` user; as that user clone the repo, write
   `apps/web/.env.production.local` (see `.env.example`), then
   `pnpm install --frozen-lockfile`, `pnpm --filter @oxbow/web build` and
   `pm2 start infra/ecosystem.config.cjs`, `pm2 save`.
3. As root: `pm2 startup systemd -u oxbow --hp /home/oxbow` so the app starts
   on boot, install the Nginx site, then
   `certbot --nginx -d oxbowflow.com -d www.oxbowflow.com --redirect`.

## The tracker

1. As root, the database and Redis (skip if `apps/api/.env` already exists):

   ```bash
   sudo bash /home/oxbow/oxbow/infra/setup-data.sh
   ```

2. As root, put the RPC URL (with its key) after `RPC_URL=` and the wallet that
   receives the swap fee after `OXBOW_TREASURY=`. The file is readable only by
   the `oxbow` user:

   ```bash
   nano /home/oxbow/oxbow/apps/api/.env
   ```

   The treasury needs a little SOL in it (at least 0.001) before the fee
   switches on: a transfer to an empty account would fail, so until then swaps
   go through fee-free and `/api/status` shows swaps as degraded.

3. As `oxbow`: deploy (applies the migrations, starts `oxbow-api` and
   `oxbow-worker`):

   ```bash
   sudo -iu oxbow bash /home/oxbow/oxbow/infra/deploy.sh
   ```

4. As root: the Nginx site (the live stream path), then HTTPS again, since the
   copy replaces certbot's edits:

   ```bash
   cp /home/oxbow/oxbow/infra/nginx/oxbowflow.conf /etc/nginx/sites-available/oxbowflow.conf
   ```

   ```bash
   certbot --nginx -d oxbowflow.com -d www.oxbowflow.com --redirect --reinstall
   ```

   ```bash
   nginx -t && systemctl reload nginx
   ```

5. Smart money is found automatically: the worker runs a discovery round at
   start and every two hours. To fill the feed right away, run a few rounds
   by hand (each takes a minute or two):

   ```bash
   cd /home/oxbow/oxbow && sudo -u oxbow pnpm --filter @oxbow/api wallets discover
   ```

6. Optional: add featured wallets, one per command, with a public label.
   Only addresses you have checked yourself:

   ```bash
   cd /home/oxbow/oxbow && pnpm --filter @oxbow/api wallets add WALLET_ADDRESS --label "Name" --featured
   ```

   ```bash
   cd /home/oxbow/oxbow && pnpm --filter @oxbow/api wallets list
   ```

   Each new wallet's recent trades are read within a minute ("reading history"
   in the list until then). `wallets unfeature`, `wallets remove` undo it.

Check: `curl -s https://oxbowflow.com/api/status` shows the RPC slot and
`"tracker":{"state":"OK",...,"live":true}`; `pm2 ls` shows three processes
online; `pm2 logs oxbow-worker` shows each wallet catching up and live trades
as they happen.

RPC use: one websocket subscription per tracked wallet, one transaction read
per trade, a catch-up call per wallet every `TRACKER_RESYNC_SEC` (5 min),
about 1,000 calls per discovery round (`DISCOVERY_EVERY_MIN`, 2 h), and up to
25 per token page every 15 s while someone has it open (order flow). On
Helius's free plan, raise `DISCOVERY_EVERY_MIN` if credits run low.
Jupiter's free API is rate-limited; at scale, get a key at portal.jup.ag and
set `JUPITER_API_BASE=https://api.jup.ag` and `JUPITER_API_KEY`.

## Backups

A daily `pg_dump` at 03:17 server time into `/var/backups/oxbow`, each one
read back before it is kept, 14 days kept. Install once as root (again after
`backup-db.sh` changes):

```bash
sudo bash /home/oxbow/oxbow/infra/install-backup.sh
```

The dumps stay on the same server, so also copy the newest one off it now and
then (SFTP, as root: `/var/backups/oxbow`), or turn on Hostinger's VPS backups.

Restore one (stops the API and the tracker meanwhile). The dumps are readable by root only,
so the file goes in through `<`, which the root shell opens:

```bash
sudo -iu oxbow pm2 stop oxbow-api oxbow-worker
```

```bash
sudo -u postgres pg_restore --clean --if-exists --no-owner --role=oxbow -d oxbow < /var/backups/oxbow/oxbow-YYYYMMDD-HHMMSS.dump
```

```bash
sudo -iu oxbow pm2 start oxbow-api oxbow-worker
```

## Updates

```bash
sudo -iu oxbow bash /home/oxbow/oxbow/infra/deploy.sh
```
