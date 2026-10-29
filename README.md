# Oxbow

Stock-paired liquidity pools on Solana: pair a token that already exists
on-chain with a tokenized stock (TSLAx, NVDAx, SPYx…), SOL or USDC, browse every
pool created through the app, and check who holds each pool's liquidity.

The approved UI prototype lives in [`design/oxbow.html`](design/oxbow.html) and
is the source of truth for look, layout, copy and interactions.

## Status

| Milestone | Scope | State |
| --- | --- | --- |
| M1 | Monorepo, full UI port on a mock API layer | Done |
| **M2** | Prisma, Fastify endpoints, Redis, stock seed, token lookup | **Done, awaiting review** |
| **M3** | Wallet signing, Raydium CPMM create flow, register endpoint | **Built; devnet run pending network access** |
| M4 | Meteora, Orca, locks, liquidity management, dashboard from chain | Not started |
| M5 | Worker, webhooks, snapshots, SSE feed, Jupiter swap | Not started |
| M6 | Hardening, rate limits, PM2 + Nginx + SSL, mainnet switch | Not started |

The app runs in one of two modes, chosen at build time:

- **Live data** (`NEXT_PUBLIC_LIVE_DATA=1`): pages read the Oxbow API, which
  serves pools from Postgres, stock and SOL/USDC prices from Pyth or Jupiter,
  and token facts from the chain. "Select wallet" connects the visitor's real
  wallet read-only (public address only). Creating pools, swaps and liquidity
  actions show "opens soon" until M3/M4, so nothing is ever signed.
- **Sample data** (default): the prototype's mock data and a simulated wallet,
  with a strip above the ticker saying so.

### M3: creating pools (Raydium CPMM)

- The server builds the create transaction (`packages/solana/src/raydium-cpmm.ts`,
  program ids and layouts from Raydium's SDK): Raydium's `initialize`, SOL
  wrapped and unwrapped when SOL is a side, Raydium's support-mint accounts
  for whitelisted Token-2022 stocks, and the Oxbow fee to the treasury, all
  in one transaction. Before the wallet sees it, the API checks the pair
  asset is listed and priced, the fee tier exists on chain, the pool doesn't
  exist yet, the wallet holds enough of both sides and SOL for fees, and
  runs a dry run.
- The creator signs in their own wallet (Wallet Standard
  `signAndSendTransaction`, or `signTransaction` plus `/api/tx/send`).
- `POST /api/pools/register` takes only the signature and reads everything
  else from the chain: Raydium's initialize in the transaction, the creator
  signed and paid, the Oxbow fee reached the treasury, the pair asset is
  listed, then the pool account and vault balances. The pool appears in
  Explore and on the live feed at once.
- "Burn" is a second approval that burns the creator's LP tokens; the burn
  is verified the same way and the pool shows BURNED with the transaction
  as proof. Timed locks, Meteora and Orca arrive with M4.
- Creation is off until `OXBOW_TREASURY` is set in `apps/api/.env`.
  `pnpm --filter @oxbow/api devnet:create` runs the whole flow on devnet
  with a throwaway wallet; run it before switching creation on for mainnet.

### M2: live data

- `packages/db`: Prisma 7 schema (tokens, verified stocks, SOL/USDC quote
  tokens, pools, snapshots, trades, liquidity events) and migrations.
- `apps/api`: Fastify with every read route from the brief (`/api/stats`,
  `ticker`, `movers`, `pools`, `pools/:address` + `chart` + `trades`,
  `stocks`, `quotes`, `tokens/:mint`, `wallet/:address/positions|activity`,
  `status`, `activity/recent`, `activity/stream` (SSE from Redis pub/sub)),
  inputs checked with the shared zod schemas, Redis caching, rate limits in
  Redis (60/min reads, 30/min token lookups, 10/min register), client IP
  only from the local nginx hop. `POST /api/pools/register` validates and
  answers 501 until on-chain verification ships with pool creation (M3).
  Wallet positions answer `[]` until they are read from the chain (M4).
- Stock prices: Pyth (by feed id) or Jupiter (by mint), as each stock's seed
  entry says; a snapshot every 5 minutes gives the 24h change and card
  sparklines, and stands in when a source is down. `/api/status` reports the
  RPC slot and latency, price freshness and the indexer heartbeat (M5).
- Verified stocks come only from `apps/api/stocks.json`, which the owner fills
  from the issuer's official list (`stocks.example.json` is the template;
  every entry needs the URL it was copied from). `pnpm --filter @oxbow/api
  seed:stocks` checks each mint on the chain (exists, token program,
  decimals, on-chain symbol), its price, and that a $1,000 USDC buy through
  Jupiter moves the price less than 2%, then prints a review table; `--write`
  saves it. Stocks failing the price or liquidity check are kept but disabled
  with the reason; stocks dropped from the file are disabled.
- Web: an HTTP client behind the same `OxbowApi` interface, response checks
  against the shared schemas, Wallet Standard connection (with the injected
  provider as fallback), silent reconnect, account-switch tracking.

### Added after M1 review (still on mock data)

- **Trading**: buy and sell in the pool drawer, slippage setting (0.5 / 1 / 2%
  or custom, warning above 5%), minimum received, MAX, line or candle chart
  with volume, recent trades, Solscan links (DexScreener / Birdeye on mainnet
  only), "Get <token>" link, search by pool or mint address.
- **Trust**: token safety checks (mint / freeze authority, transfer fee,
  hook, delegate, holder concentration, token age, duplicate ticker, creator
  history) with a level on every pool; risk acknowledgement in Create for
  tokens with live authorities; US market hours (NYSE holidays, early
  closes) with closed-market and stale-feed notices; impermanent loss
  explained in Docs with a calculator.
- **Dashboard**: profit / loss vs. deposit, impermanent loss per position,
  partial withdraw, activity history with transaction links.
- **Legal**: Terms, Privacy and Risk pages (drafts, see below), one-time
  terms confirmation before connecting a wallet, region notice by country
  header (`GEO_BLOCKED_COUNTRIES`).
- **Growth**: English and Indonesian (cookie, else browser language),
  watchlist (this browser), share menu, Open Graph images per pool,
  sitemap and robots, empty states for a launch with no pools.
- **Ops**: optional Sentry and Plausible, `/status` page, error pages, a
  lite mode for low-end phones (no blur, grain or city animation).

### Token logos and sample-data safeguards

- Every token shows a logo. Real tokens use the image from their metadata
  (`logoUri`, https or a site path only); tokens without one fall back to a
  drawn avatar, and Create tells the creator their token has no logo.
- Create looks up pasted mints on the chain (`/api/token/[mint]`, code in
  `packages/solana/src/token-info.ts`): name, ticker, logo, supply, decimals,
  authorities and Token-2022 extensions, from the Token-2022 metadata
  extension or the Metaplex metadata account, then the logo from the
  metadata's JSON file. That file's URL is chosen by the token's creator, so
  it is fetched with public-address-only, https-only, size- and time-capped
  requests (`packages/solana/src/safe-fetch.ts`). Only the sample tokens
  (`SAMPLE_TOKENS` in `seed.ts`) skip the chain.
- The sample tokens' logos live in `apps/web/public/tokens/` as SVGs built by
  `scripts/token-logos.py`, all in one style (gradient base, soft light, flat
  white mark): original marks for the sample memecoins, and the companies'
  own marks (simple-icons, CC0) for the stock tokens, SOL and USDC (see
  [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)).
- While the app runs on sample data (`apps/web/src/lib/api/mode.ts`), a strip
  above the ticker says so, and explorer and Jupiter links show as disabled,
  since the sample addresses don't exist on any network. Neither shows in
  live-data mode.

### Brand and domain

- Domain: **oxbowflow.com** (`NEXT_PUBLIC_SITE_URL`, also the default for
  share links, the sitemap and Open Graph images).
- Logo: "Oxbow Lake", an O whose hole sits off-center like the crescent lake
  a river bend leaves behind, in a frost-to-electric-blue gradient with a
  lowercase Geist SemiBold wordmark. Files in `apps/web/public/brand/`
  (app icon, mark and logo for dark and light backgrounds, PNG 192/512,
  and `social/` with a circle-safe profile picture and an X header),
  built by `scripts/brand-logo.py` and `scripts/brand-png.mjs`; the favicon,
  Apple touch icon and web manifest use them.

### Needs the owner before launch

- `apps/api/stocks.json`: every stock mint and the USDC mint, copied from
  the issuers' official pages (Oxbow never writes an address from memory),
  checked with `seed:stocks` and saved with `--write`.
- An RPC provider URL with key (e.g. Helius) in `RPC_URL` on the server.
- Before M3: the treasury address and fee, and which venues to launch with.
- Legal pages are drafts written without a lawyer. Have them reviewed, then
  set `LEGAL_*` and `GEO_BLOCKED_COUNTRIES`.
- `NEXT_PUBLIC_BUY_TOKEN_URL`: the default Jupiter URL format was not
  verified from this environment.
- Price alerts and notifications need the worker (M5).

## Layout

```
apps/
  web/        Next.js 14 (App Router) frontend
  api/        Fastify API, stock seed script (+ Vitest against Postgres/Redis)
  worker/     BullMQ jobs (placeholder until M5)
packages/
  shared/     zod API schemas, formatters, constant-product math (+ Vitest)
  solana/     VenueAdapter interface (implementations in M3/M4)
  db/         Prisma schema, migrations, client
design/
  oxbow.html  approved prototype
```

Inside `apps/web/src`:

- `app/` routes. `/pool/[address]` is a full page on direct visits; in-app
  links are intercepted by `app/@drawer/(.)pool/[address]` and open the
  right-side drawer over the current page, with a shareable URL.
- `styles/` the prototype's CSS, ported verbatim and split by area in the
  original cascade order. `production.css` holds the few additions.
- `components/` React ports of the prototype's renderers (Card, TokenAvatar,
  Sparkline, PriceChart, PixelCity, CreateFlow, PricingDemo…).
- `lib/api/` the `OxbowApi` interface (one method per API route in the brief),
  the HTTP client (`http.ts`) and the mock implementation (`mock/seed.ts` is
  the prototype's data generator, unchanged); `mode.ts` picks one.
- `lib/chain/` wallet-signed actions behind a `Chain` interface: the mock with
  the prototype's timings on sample data, "not ready yet" on live data.
- `lib/wallets.ts` the wallet list, detection and read-only connection.

## Deploy

See [`infra/README.md`](infra/README.md): Nginx, PM2 and `infra/deploy.sh`
for the VPS behind oxbowflow.com.

## Setup

Requires Node 20.11+ and pnpm 10.

```bash
pnpm install
```

```bash
cp .env.example apps/web/.env.local
```

```bash
pnpm dev
```

The app runs at http://localhost:3000.

## Checks

```bash
pnpm typecheck
```

```bash
pnpm lint
```

```bash
pnpm test
```

The API tests need a local PostgreSQL and Redis. They create and migrate a
separate `oxbow_test` database (`TEST_DATABASE_URL`, default
`postgresql://oxbow:oxbow@127.0.0.1:5432/oxbow_test`; Redis database 15 via
`TEST_REDIS_URL`) and are skipped with a warning when either is missing.

End-to-end tests run against a production build (Playwright, Chromium):

```bash
pnpm --filter @oxbow/web build
```

```bash
pnpm e2e
```

The same tests cover a mainnet build; they read the network from the page:

```bash
NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta pnpm --filter @oxbow/web build
```

```bash
pnpm e2e
```

Live-data mode has its own end-to-end tests (`e2e/live.spec.ts`), against
the API serving the test fixtures:

```bash
DATABASE_URL=postgresql://oxbow:oxbow@127.0.0.1:5432/oxbow_test pnpm --filter @oxbow/api e2e:fixtures
```

```bash
cd apps/api && DATABASE_URL=postgresql://oxbow:oxbow@127.0.0.1:5432/oxbow_test REDIS_URL=redis://127.0.0.1:6379/15 node --import tsx src/index.ts
```

```bash
NEXT_PUBLIC_LIVE_DATA=1 NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta pnpm --filter @oxbow/web build
```

```bash
E2E_LIVE=1 pnpm e2e
```

Prototype comparison screenshots (1920 / 1440 / 390px): see
[`apps/web/screens/README.md`](apps/web/screens/README.md).

## Environment

See [`.env.example`](.env.example). Web:

- `NEXT_PUBLIC_LIVE_DATA=1`: read the Oxbow API (live data). Empty: sample data.
- `API_INTERNAL_URL`: where server rendering reaches the API (default
  `http://127.0.0.1:4000`). Browsers call `/api` on the site itself; nginx
  forwards it (Next does when there is no nginx).
- `NEXT_PUBLIC_SOLANA_CLUSTER`: network pill label and explorer links (`devnet` or `mainnet-beta`).
  The code default stays `devnet` (devnet first).
- `NEXT_PUBLIC_OXBOW_FEE_LAMPORTS`: Oxbow fee shown in the cost breakdown and docs (default 0.1 SOL).
- `NEXT_PUBLIC_CONTRACT_ADDRESS`: hero CA box; "Coming soon" while empty.
- `NEXT_PUBLIC_X_URL`, `NEXT_PUBLIC_TELEGRAM_URL`: the official accounts (https only). Empty ones show as "Soon" in the footer; the nav's X icon appears once its URL is set.
- `NEXT_PUBLIC_SITE_URL`: canonical origin for share links, sitemap and OG images (defaults to `https://oxbowflow.com`).
- `NEXT_PUBLIC_BUY_TOKEN_URL`: "Get <token>" link, `{mint}` is replaced.
- `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` (+ `NEXT_PUBLIC_PLAUSIBLE_SRC`), `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`: analytics and error reporting, off when empty.
- `NEXT_PUBLIC_MOCK_EMPTY=1`: start the mock with no pools, to check launch-day empty states.
- `GEO_BLOCKED_COUNTRIES`, `GEO_COUNTRY_HEADER`: region notice. The app trusts the
  country header, so the proxy in front of it must set it and strip any copy
  sent by the client: Cloudflare sends `CF-IPCountry`; with Nginx and GeoIP2,
  `proxy_set_header CF-IPCountry $geoip2_data_country_code;` (or set
  `GEO_COUNTRY_HEADER` to your own header name).
- `LEGAL_ENTITY`, `LEGAL_CONTACT_EMAIL`, `LEGAL_GOVERNING_LAW`, `LEGAL_UPDATED`: filled into the legal pages.
- `RPC_URL` (server only, so a keyed URL stays private): the RPC the token lookup reads from. Without it the
  lookup uses Solana's public endpoint for `NEXT_PUBLIC_SOLANA_CLUSTER`, which is rate-limited.
- `IPFS_GATEWAY`: gateway for `ipfs://` metadata and logos (default `https://ipfs.io/ipfs/`).

API (`apps/api/.env`, read at start; `infra/setup-data.sh` writes it on the VPS):
`DATABASE_URL`, `REDIS_URL`, `SOLANA_CLUSTER`, `RPC_URL`, `PORT` / `HOST`
(default `127.0.0.1:4000`), `JUPITER_API_BASE` (default
`https://lite-api.jup.ag`), `PYTH_HERMES_URL` (default
`https://hermes.pyth.network`), `IPFS_GATEWAY`, `LOG_LEVEL`. Neither price
host could be reached from the build environment; check both against the
providers' current docs before launch.

`NEXT_PUBLIC_*` values are inlined at build time, so rebuild after changing
them. The server-only values are read at runtime.
