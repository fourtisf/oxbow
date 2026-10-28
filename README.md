# Oxbow

Stock-paired liquidity pools on Solana: pair a token that already exists
on-chain with a tokenized stock (TSLAx, NVDAx, SPYx…), SOL or USDC, browse every
pool created through the app, and check who holds each pool's liquidity.

The approved UI prototype lives in [`design/oxbow.html`](design/oxbow.html) and
is the source of truth for look, layout, copy and interactions.

## Status

| Milestone | Scope | State |
| --- | --- | --- |
| **M1** | Monorepo, full UI port on a mock API layer | **Done, awaiting review** |
| M2 | Prisma, Fastify endpoints, Redis, stock seed, token lookup | Not started |
| M3 | Wallet adapter, Raydium CPMM create flow on devnet, register endpoint | Not started |
| M4 | Meteora, Orca, locks, liquidity management, dashboard from chain | Not started |
| M5 | Worker, webhooks, snapshots, SSE feed, Jupiter swap | Not started |
| M6 | Hardening, rate limits, PM2 + Nginx + SSL, mainnet switch | Not started |

Until M2, every number in the app is the prototype's sample data and every
wallet action is simulated. Nothing touches a chain.

## Layout

```
apps/
  web/        Next.js 14 (App Router) frontend
  api/        Fastify API (skeleton + /health until M2)
  worker/     BullMQ jobs (placeholder until M5)
packages/
  shared/     zod API schemas, formatters, constant-product math (+ Vitest)
  solana/     VenueAdapter interface (implementations in M3/M4)
  db/         Prisma (M2)
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
- `lib/api/` the `OxbowApi` interface (one method per API route in the brief)
  and its mock implementation (`mock/seed.ts` is the prototype's data
  generator, unchanged). M2 adds an HTTP client behind the same interface.
- `lib/chain/` wallet-signed actions behind a `Chain` interface; M1 ships a
  mock with the prototype's timings.

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

End-to-end tests run against a production build (Playwright, Chromium):

```bash
pnpm --filter @oxbow/web build
```

```bash
pnpm e2e
```

Prototype comparison screenshots (1920 / 1440 / 390px): see
[`apps/web/screens/README.md`](apps/web/screens/README.md).

## Environment

See [`.env.example`](.env.example). In M1 only these matter:

- `NEXT_PUBLIC_SOLANA_CLUSTER`: network pill label (`devnet` or `mainnet-beta`).
- `NEXT_PUBLIC_OXBOW_FEE_LAMPORTS`: Oxbow fee shown in the cost breakdown and docs (default 0.1 SOL).
- `NEXT_PUBLIC_CONTRACT_ADDRESS`: hero CA box; hidden when empty.
- `NEXT_PUBLIC_X_URL`, `NEXT_PUBLIC_TELEGRAM_URL`, `NEXT_PUBLIC_DISCORD_URL`: social links.

`NEXT_PUBLIC_*` values are inlined at build time, so rebuild after changing them.
