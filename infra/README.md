# infra

Deployment for the VPS (Ubuntu 24.04) serving **oxbowflow.com**. DNS: an `A`
record for `@` pointing at the server and a `CNAME` for `www` pointing at
`oxbowflow.com`.

- `nginx/oxbowflow.conf`: public entry point. Forwards to the app on
  `127.0.0.1:3000`, overwrites `X-Forwarded-For` (the token lookup rate limit
  reads it) and drops any client-sent `CF-IPCountry` (the region notice trusts
  it; set it here from GeoIP2 if you turn region blocking on). Certbot adds
  HTTPS on top.
- `ecosystem.config.cjs`: PM2 process `oxbow-web` (`next start` on localhost).
- `deploy.sh`: update in one step: pull, install, build, reload, save.

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

## Updates

```bash
sudo -iu oxbow bash /home/oxbow/oxbow/infra/deploy.sh
```

Later milestones add the API and worker processes to `ecosystem.config.cjs`
and an `api.oxbowflow.com` server block.
