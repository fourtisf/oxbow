# Oxbow

Follow smart money on Solana. Oxbow tracks a list of wallets on chain, shows
every buy and sell they make seconds after it lands, and lets anyone copy a
trade in one tap from their own wallet.

- **Live feed** of tracked wallets' trades (token, size, price paid, USD
  value), with a Following tab for the wallets you follow.
- **Smart money, found automatically**: the worker samples the traders and
  biggest holders of the tokens trading most, reads each candidate's own
  history, drops bots and idle wallets, and tracks the ones that keep closing
  trades at a profit (SMART badge). The owner can also feature wallets, and
  anyone can add one.
- **Wallets**: a 30-day leaderboard by realized profit, and a page per wallet
  with realized and unrealized PnL, win rate, holdings (checked against the
  chain) and closed positions.
- **Tokens**: price, market cap, liquidity, holders, age, a safety check
  (mint and freeze authority, holder concentration, developer share, organic
  score, Jupiter verification) and which tracked wallets hold it.
- **Order flow**: every token page shows its latest fills by any trader,
  read from the chain and grouped by price like an order book, with buy and
  sell pressure (Solana tokens trade in pools, so there are no resting orders).
- **Limit orders** through Jupiter's trigger program: buy at a lower price or
  sell at a higher one; open orders listed and cancellable in the trade panel.
- **Copy trading**: buy or sell any token for SOL through Jupiter's routing.
  The server builds the transaction, the visitor's wallet signs it. Oxbow
  charges `OXBOW_FEE_BPS` (0.5% by default) on the SOL side as a plain SOL
  transfer to the treasury in the same transaction. Non-custodial: nothing is
  signed, held or traded without the visitor's own approval.
- **Alerts**: browser notifications for followed wallets' trades. Follows,
  nicknames and alert settings live in the browser (no accounts).

## Layout

| Path | What |
| --- | --- |
| `apps/web` | Next.js 14 (App Router), React Query, zustand. Pages: `/`, `/wallets`, `/wallet/[address]`, `/token/[mint]`, `/following`, `/docs`, `/status`, legal. |
| `apps/api` | Fastify API (`src/index.ts`) and the tracker worker (`src/worker.ts`), Redis cache and rate limits, `scripts/wallets.ts` CLI. |
| `packages/db` | Prisma 7 schema: `TrackedWallet`, `WalletTrade`, `TokenMeta`. |
| `packages/shared` | zod schemas for every API response and input, formatting, safety rules. |
| `packages/solana` | RPC connection, on-chain token lookup, SSRF-safe metadata fetch, swap transaction assembly (`swap.ts`). |
| `infra` | PM2, Nginx, deploy, database setup and backups for the VPS. See [`infra/README.md`](infra/README.md). |

## How the tracker works

- **Reading trades** (`apps/api/src/tracker/parse.ts`): a trade is read from
  the wallet's own balance changes in a transaction it signed, not from any
  one DEX's instructions, so every venue and aggregator works the same way.
  Wrapped SOL counts as SOL, token-account rent is taken out, fee-sized SOL
  moves are ignored, a SOL or stablecoin payment makes a BUY or SELL, and a
  token-for-token swap makes one of each. Transfers, airdrops and liquidity
  moves are not trades. Tested against real mainnet transactions
  (`apps/api/test/fixtures`).
- **Following wallets** (`src/worker.ts`): one websocket log subscription per
  wallet for live trades, plus a catch-up round every `TRACKER_RESYNC_SEC`
  that reads each wallet's signatures since its bookmark (the bookmark only
  moves past signatures read successfully, so failures are retried). A new
  wallet gets its latest `BACKFILL_LIMIT` transactions read first.
- **Token data** (`src/tracker/tokens.ts`): Jupiter's token API (names,
  logos, prices, audit facts), the chain for tokens Jupiter doesn't list, and
  a placeholder from the transaction when both fail; stand-ins are retried
  within minutes. Stablecoins are Jupiter's verified `stable` tokens.
- **PnL** (`src/tracker/pnl.ts`): average cost. Sells beyond what was seen
  bought have no known cost and are left out rather than counted as profit.
  USD values use the SOL price when the trade was read.
- **Live updates**: the worker publishes trades on Redis; every API process
  fans them out to browsers over SSE (`/api/feed/stream`).
- **Discovery** (`src/tracker/discovery.ts`): candidates from the market tapes
  of Jupiter's top-traded tokens (1 h and 24 h) and their largest wallet
  holders. Each is judged on its own last `DISCOVERY_HISTORY_TXS`
  transactions: dropped for bot pace (60+ transactions an hour, or three fills
  of one token in a short sample), sandwich shape, or no swap in a week;
  passed as "consistent" (3+ tokens closed, 55%+ in profit, $250+ realized)
  or "big win" ($2,500+ realized, no more losses than wins). Discovered
  wallets that close more losses than wins over two weeks are dropped daily.
  `pnpm --filter @oxbow/api wallets discover` runs a round by hand.
- **Market tape** (`src/tracker/tape.ts`): signatures touching a mint, read
  newest first and parsed for every signer, shared in Redis for token pages
  and discovery, refreshed at most every 15 s per token.

## API

| Route | |
| --- | --- |
| `GET /api/feed?wallets=&mint=&side=&minUsd=&cursor=&limit=` | Trades, newest first, paged. |
| `GET /api/feed/stream` | Server-sent events, `event: trade`. |
| `GET /api/wallets` | Leaderboard (last 30 days). |
| `GET /api/wallets/:address` | Stats, holdings, closed positions (404 if not tracked). |
| `GET /api/wallets/:address/trades` | One wallet's trades. |
| `POST /api/wallets` `{address}` | Track a wallet (plain system accounts only; 10 an hour per IP). |
| `GET /api/tokens/hot` | What tracked wallets bought most in 24 h. |
| `GET /api/tokens/:mint` | Token facts, safety check, tracked wallets in it. |
| `GET /api/tokens/:mint/flow` | Latest fills by any trader, grouped by price level. |
| `POST /api/limit/create`, `POST /api/limit/cancel`, `GET /api/limit/orders?wallet=` | Jupiter limit orders (unsigned transactions, checked). |
| `GET /api/tokens/search?q=` | Jupiter token search (name, ticker or CA). |
| `GET /api/swap/quote` | Quote for SOL → token or token → SOL, fee included. |
| `POST /api/swap/build` | Unsigned v0 transaction for the trader's wallet. |
| `POST /api/tx/send`, `GET /api/tx/:signature` | Send a signed transaction; its status. |
| `GET /api/wallet/:address/balances?mints=` | Balances for the trade panel. |
| `GET /api/status` | API, RPC, tracker and swap health. |

## Run it locally

Needs Node 22, pnpm 10, PostgreSQL and Redis.

```bash
pnpm install
```

```bash
cp .env.example apps/api/.env
```

Edit `apps/api/.env`: `DATABASE_URL`, and `RPC_URL` with a mainnet RPC key.

```bash
DATABASE_URL=postgresql://oxbow:oxbow@127.0.0.1:5432/oxbow pnpm --filter @oxbow/db migrate:deploy
```

```bash
pnpm --filter @oxbow/api wallets add WALLET_ADDRESS --label "Name" --featured
```

Then, each in its own terminal:

```bash
pnpm --filter @oxbow/api dev
```

```bash
pnpm --filter @oxbow/api worker
```

```bash
pnpm dev
```

## Checks

```bash
pnpm typecheck
```

```bash
pnpm test
```

API tests need a local Postgres and Redis (`TEST_DATABASE_URL`,
`TEST_REDIS_URL`; defaults in `apps/api/test/global-setup.ts`) and are skipped,
loudly, without them. Browser tests run against a production build with the
API mocked in the browser (`apps/web/e2e/mock-api.ts`):

```bash
pnpm --filter @oxbow/web build && pnpm e2e
```

## Configuration

Every variable is listed with its purpose in [`.env.example`](.env.example).
Secrets (RPC key, database password, Jupiter key) stay in `apps/api/.env` on
the server and are never sent to the browser.
