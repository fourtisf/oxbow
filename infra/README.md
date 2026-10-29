# infra

Deployment for the VPS (Ubuntu 24.04) serving **oxbowflow.com**. DNS: an `A`
record for `@` pointing at the server and a `CNAME` for `www` pointing at
`oxbowflow.com`.

- `nginx/oxbowflow.conf`: public entry point. `/api/` goes to the API on
  `127.0.0.1:4000` (the live activity stream unbuffered), everything else to
  the web app on `127.0.0.1:3000`. Overwrites `X-Forwarded-For` (both apps
  rate-limit by it) and drops any client-sent `CF-IPCountry` (the region
  notice trusts it; set it here from GeoIP2 if you turn region blocking on).
  Certbot adds HTTPS on top.
- `ecosystem.config.cjs`: PM2 processes `oxbow-web` (`next start`) and, once
  `apps/api/.env` exists, `oxbow-api` (Fastify through tsx), both on localhost.
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

## Live data (M2)

1. As root, the database and Redis:

   ```bash
   sudo bash /home/oxbow/oxbow/infra/setup-data.sh
   ```

2. As root, put the RPC provider URL (with its key) after `RPC_URL=`. The file
   is readable only by the `oxbow` user:

   ```bash
   nano /home/oxbow/oxbow/apps/api/.env
   ```

3. As `oxbow`: deploy once (applies the migrations and starts `oxbow-api`):

   ```bash
   sudo -iu oxbow bash /home/oxbow/oxbow/infra/deploy.sh
   ```

4. As `oxbow`: copy `apps/api/stocks.example.json` to `apps/api/stocks.json`,
   fill every `mint` and `source` from the issuer's official list (and the
   USDC mint from Circle's), then check it and compare the table with the
   official list:

   ```bash
   cd /home/oxbow/oxbow && pnpm --filter @oxbow/api seed:stocks
   ```

   When every mint matches, save it:

   ```bash
   cd /home/oxbow/oxbow && pnpm --filter @oxbow/api seed:stocks --write
   ```

5. As root: the new Nginx site (adds `/api`), then HTTPS again, since the copy
   replaces certbot's edits:

   ```bash
   cp /home/oxbow/oxbow/infra/nginx/oxbowflow.conf /etc/nginx/sites-available/oxbowflow.conf
   ```

   ```bash
   certbot --nginx -d oxbowflow.com -d www.oxbowflow.com --redirect --reinstall
   ```

   ```bash
   nginx -t && systemctl reload nginx
   ```

6. As `oxbow`: switch the web app to live data and rebuild:

   ```bash
   echo 'NEXT_PUBLIC_LIVE_DATA=1' >> /home/oxbow/oxbow/apps/web/.env.production.local
   ```

   ```bash
   sudo -iu oxbow bash /home/oxbow/oxbow/infra/deploy.sh
   ```

Check: `curl -s https://oxbowflow.com/api/status` shows `"sampleData":false`
and the RPC slot; `pm2 ls` shows both processes online; `pm2 logs oxbow-api`
shows price-source warnings, if any.

## Pool creation (M3)

Off until a treasury is set. First run the devnet test (see the root README),
then, as root, put the wallet that receives the Oxbow fee in the API's env
and restart the API:

```bash
sed -i 's|^OXBOW_TREASURY=.*|OXBOW_TREASURY=YOUR_WALLET_ADDRESS|' /home/oxbow/oxbow/apps/api/.env
```

```bash
grep -q '^OXBOW_TREASURY=' /home/oxbow/oxbow/apps/api/.env || echo 'OXBOW_TREASURY=YOUR_WALLET_ADDRESS' >> /home/oxbow/oxbow/apps/api/.env
```

```bash
sudo -iu oxbow pm2 restart oxbow-api --update-env
```

`curl -s https://oxbowflow.com/api/venues` then shows `"createEnabled":true`
and Raydium's fee tiers. The fee is `OXBOW_FEE_LAMPORTS` (default 0.1 SOL).

## Backups

A daily `pg_dump` at 03:17 server time into `/var/backups/oxbow`, each one
read back before it is kept, 14 days kept. Install once as root (again after
`backup-db.sh` changes):

```bash
sudo bash /home/oxbow/oxbow/infra/install-backup.sh
```

The dumps stay on the same server, so also copy the newest one off it now and
then (SFTP, as root: `/var/backups/oxbow`), or turn on Hostinger's VPS backups.

Restore one (stops the API meanwhile). The dumps are readable by root only,
so the file goes in through `<`, which the root shell opens:

```bash
sudo -iu oxbow pm2 stop oxbow-api
```

```bash
sudo -u postgres pg_restore --clean --if-exists --no-owner --role=oxbow -d oxbow < /var/backups/oxbow/oxbow-YYYYMMDD-HHMMSS.dump
```

```bash
sudo -iu oxbow pm2 start oxbow-api
```

## Updates

```bash
sudo -iu oxbow bash /home/oxbow/oxbow/infra/deploy.sh
```
