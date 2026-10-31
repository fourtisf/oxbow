# scripts

- `brand-logo.py`: the Oxbow Lake logo, mark and app icon as SVG
  (`apps/web/public/brand/`).
- `brand-png.mjs [filter]`: renders the brand artwork to PNG: app icons,
  profile picture, X headers (one saying "CA coming soon") and the "coming soon" announcement cards
  (`apps/web/public/brand/social/`). With a filter, only matching files.
- `token-logos.py`: the sample tokens' logos (`apps/web/public/tokens/`).
- `wallet-logos.py`: the wallets' official icons (`apps/web/public/wallets/`).

The verified-stock seed lives with the API: `pnpm --filter @oxbow/api
seed:stocks` (see the root README). The copy for the X and Telegram accounts
is in [`design/social-kit.md`](../design/social-kit.md).
