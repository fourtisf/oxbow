# Oxbow social kit (X and Telegram)

Everything needed to open the official accounts. When they exist, put the
links in `apps/web/.env.production.local` and deploy; the footer's "Soon"
pills turn into links and the X icon appears in the nav:

```
NEXT_PUBLIC_X_URL=https://x.com/yourhandle
NEXT_PUBLIC_TELEGRAM_URL=https://t.me/yourchannel
```

## Names

- Display name: **Oxbow** (both).
- Handle: same on both if you can get it, in this order: `oxbowflow`
  (matches the domain), `oxbowfi`, `useoxbow`. Availability was not checked.
- Telegram: start with a **public channel** for announcements (only admins
  post, so no scam replies). Add a discussion group later, once someone can
  moderate it.

## Images

All in `apps/web/public/brand/social/`, and on the site after deploy at
`https://oxbowflow.com/brand/social/<file>`.

| Use | File |
| --- | --- |
| Profile picture, X and Telegram (circle-safe) | `oxbow-profile-1024.png` |
| X header | `oxbow-x-header-1500x500.png` |
| Announcement post, X and Telegram (16:9) | `oxbow-coming-soon-1600x900.png` |
| Announcement post, square | `oxbow-coming-soon-1080.png` |

## X profile

- Bio (126 characters):
  > Pick a meme. Pair a stock. Stock-paired liquidity pools on Solana. CA coming soon: only ever posted here and on oxbowflow.com.
- Bio, Indonesian (134):
  > Pick a meme. Pair a stock. Pool likuiditas berpasangan saham di Solana. CA segera hadir: hanya diumumkan di sini dan di oxbowflow.com.
- Location: `Solana`. Website: `oxbowflow.com`.

## Telegram channel

- Title: `Oxbow`
- Description (208 of 255 characters):
  > Official Oxbow announcements. Stock-paired liquidity pools for any token on Solana: oxbowflow.com. Admins never DM first and never ask for a seed phrase. The CA is only posted here, on X and on oxbowflow.com.
- Description, Indonesian (226):
  > Pengumuman resmi Oxbow. Pool likuiditas berpasangan saham untuk token apa pun di Solana: oxbowflow.com. Admin tidak pernah DM duluan dan tidak pernah meminta seed phrase. CA hanya diumumkan di sini, di X, dan di oxbowflow.com.

## Pinned post (X and Telegram, with the 16:9 card)

Fits X's 280 characters, counting the link as 23.

```
Pick a meme. Pair a stock.

Oxbow lets anyone pair a Solana token with a tokenized stock, SOL or USDC in its own liquidity pool, and shows who holds every pool's liquidity.

Coming soon: oxbowflow.com

No CA yet. Any "Oxbow token" before we post it here is fake.
```

Indonesian:

```
Pick a meme. Pair a stock.

Di Oxbow, siapa pun bisa memasangkan token Solana dengan token saham, SOL, atau USDC, dan melihat siapa pemegang likuiditas tiap pool.

Segera hadir: oxbowflow.com

Belum ada CA. "Token Oxbow" sebelum kami umumkan di sini = palsu.
```

## First posts

One every day or two, square card or none. Each line is something the
product already does, so nothing has to be walked back later.

1. ```
   Memecoins and tokenized stocks, in one pool.

   Pair any Solana token with TSLAx, NVDAx, SOL or USDC. Coming soon.
   ```
2. ```
   Every pool on Oxbow shows who holds its liquidity: burned, locked, or still with the creator.

   Check before you trade.
   ```
3. ```
   Stock tokens on Oxbow are checked before anyone can pair with them: a live price feed and real liquidity, or they stay off the list.
   ```
4. ```
   Oxbow never holds your funds. You approve every transaction in your own wallet.
   ```

## House rules (pin in the Telegram group when it opens)

- Admins never DM first. Anyone who does is an impersonator.
- No one from Oxbow will ever ask for your seed phrase or private key.
- Official links are only: oxbowflow.com, this channel, and the X account
  linked from oxbowflow.com.
- The CA is posted in those three places at the same time. Anything else is fake.

## Words to avoid

No price targets, returns, "guaranteed", "risk-free" or "investment".
Stock tokens are not available in every country: don't promise US users
access, and keep the Risk page link handy when people ask.
