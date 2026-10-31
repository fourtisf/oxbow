# scripts

- `brand-logo.py`: the Oxbow Lake logo, mark and app icon as SVG
  (`apps/web/public/brand/`).
- `brand-png.mjs [filter]`: renders the brand artwork to PNG: app icons,
  profile picture, X headers (one saying "CA coming soon"), the X article cover and the "coming soon" announcement cards
  (`apps/web/public/brand/social/`). With a filter, only matching files.
- `video/`: the Oxbow intro video (1920x1080, 30 fps, 50 s). `intro.html` is
  the animation (a pure function of time), `render.mjs` captures it frame by
  frame into ffmpeg (`node scripts/video/render.mjs out.mp4`, or `--stills dir
  1,8,14` to check scenes), `music.py` synthesizes the soundtrack
  (`python3 scripts/video/music.py out.wav`); then
  `ffmpeg -i out.mp4 -i out.wav -c:v copy -c:a aac -b:a 192k -shortest final.mp4`.
- `token-logos.py`: the sample tokens' logos (`apps/web/public/tokens/`).
- `wallet-logos.py`: the wallets' official icons (`apps/web/public/wallets/`).

The verified-stock seed lives with the API: `pnpm --filter @oxbow/api
seed:stocks` (see the root README). The copy for the X and Telegram accounts
is in [`design/social-kit.md`](../design/social-kit.md).
