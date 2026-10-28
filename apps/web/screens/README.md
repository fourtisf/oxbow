# Prototype comparison screenshots

`compare.mjs` drives the prototype (`design/oxbow.html`) and the running app
to the same states and screenshots both at 1920, 1440 and 390px, with
`prefers-reduced-motion` on so marquees, the city and count-ups hold still.

The prototype hero shows a sample contract address and "Solana mainnet". To
compare like for like, build the app with the same values:

```bash
NEXT_PUBLIC_CONTRACT_ADDRESS=UU8k67574bB69F8Kk1mfpzpKbbAmYS7CyGtuTpts3sNM \
NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta pnpm --filter @oxbow/web build
```

(That address is the prototype's generated placeholder, not a real token.)

```bash
pnpm --filter @oxbow/web start
```

```bash
pnpm screens
```

Open `apps/web/screens/out/index.html`. Filter with `ONLY=home,drawer` and
`WIDTHS=1440`. Expected differences: the live feed (random in both), the
connected wallet address (random in both), and anti-aliasing on a few glyphs
because the prototype loads Geist from Google Fonts while the app self-hosts
the `geist` package build.

Since M1 the app also adds things the prototype doesn't have, so these show
up as intended differences too: token safety marks next to pair names,
market-hours chips on stock cards, watchlist stars, the Buy / Sell toggle and
slippage settings in the trade box, recent trades, on-chain links, the
dashboard's profit / loss card and activity list, and the footer's legal links
and language switch.
