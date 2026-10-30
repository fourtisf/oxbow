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

- Bio (118 characters):
  > Follow smart money on Solana. Copy any trade in one tap. CA coming soon: only ever posted here and on oxbowflow.com.
- Bio, Indonesian (134):
  > Ikuti smart money di Solana. Salin trade apa pun dengan satu ketukan. CA segera hadir: hanya diumumkan di sini dan di oxbowflow.com.
- Location: `Solana`. Website: `oxbowflow.com`.

## Telegram channel

- Title: `Oxbow`
- Description (212 of 255 characters):
  > Official Oxbow announcements. Follow smart wallets on Solana and copy their trades from your own wallet: oxbowflow.com. Admins never DM first and never ask for a seed phrase. The CA is only posted here, on X and on oxbowflow.com.
- Description, Indonesian (231):
  > Pengumuman resmi Oxbow. Pantau dompet pintar di Solana dan salin trade mereka dari dompetmu sendiri: oxbowflow.com. Admin tidak pernah DM duluan dan tidak pernah meminta seed phrase. CA hanya diumumkan di sini, di X, dan di oxbowflow.com.

## Pinned post (X and Telegram, with the 16:9 card)

Fits X's 280 characters, counting the link as 23.

```
Follow the wallets that move first.

Oxbow shows every buy and sell from top Solana wallets seconds after it lands on chain, and lets you copy any trade in one tap from your own wallet.

Live: oxbowflow.com

No CA yet. Any "Oxbow token" before we post it here is fake.
```

Indonesian:

```
Ikuti dompet yang bergerak duluan.

Oxbow menampilkan setiap beli dan jual dari dompet top Solana beberapa detik setelah masuk on-chain, dan kamu bisa salin trade apa pun dengan satu ketukan dari dompetmu sendiri.

Live: oxbowflow.com

Belum ada CA. "Token Oxbow" sebelum kami umumkan di sini = palsu.
```

## First posts

One every day or two, square card or none. Each line is something the
product already does, so nothing has to be walked back later.

1. ```
   Paste any Solana wallet into Oxbow. It reads the wallet's recent trades, then shows every new one live.
   ```
2. ```
   Every token page runs a safety check first: mint and freeze authority, top holders, developer share, organic volume.

   Check before you copy.
   ```
3. ```
   Follow a wallet, turn on alerts, and your browser pings you the moment it buys.
   ```
4. ```
   Oxbow never holds your funds. Every trade is one transaction you approve in your own wallet.
   ```

## House rules (pin in the Telegram group when it opens)

- Admins never DM first. Anyone who does is an impersonator.
- No one from Oxbow will ever ask for your seed phrase or private key.
- Official links are only: oxbowflow.com, this channel, and the X account
  linked from oxbowflow.com.
- The CA is posted in those three places at the same time. Anything else is fake.

## Words to avoid

No price targets, returns, "guaranteed", "risk-free" or "investment".
Never call a wallet's next trade a sure thing or present featured wallets as
advice; keep the Risk page link handy when people ask.
