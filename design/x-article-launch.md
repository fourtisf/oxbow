# X article: launch (long form)

For X Articles on @oxbowflow. Cover image:
`apps/web/public/brand/social/oxbow-article-cover-2000x800.png` (5:2, X's
recommended ratio). Lines marked **Heading** get the "Heading" style from
the editor's "Body" menu (then delete the word "Heading:"); lines marked
**Subheading** get "Subheading". About 2,700 words.

## Title

Introducing Oxbow: Follow the Wallets That Move First

Alternatives:
- Oxbow: Smart Money on Solana, Live
- Stop Chasing Pumps. Follow the Wallets That Find Them.

## Body

Every cycle on Solana tells the same story.

A token starts moving. A few hours later it's everywhere: on your timeline, in group chats, in "alpha" calls. You buy. Then you watch the chart roll over, because the people who found it first are now selling to the people who found it last.

The information was never secret. Every one of those early buys happened on a public blockchain, visible to anyone who looked. The problem is that nobody can watch thousands of wallets at once, work out which ones actually know what they're doing, and act fast enough for it to matter.

That's what Oxbow does.

Oxbow watches the wallets that keep winning on Solana, shows you every buy and sell they make seconds after it lands on chain, and lets you copy any of those trades in one tap, straight from your own wallet.

It's live now at oxbowflow.com. This article explains what Oxbow does, how it decides which wallets are worth following, how it keeps you in control of your money, and how to get the most out of it.

**Heading:** The problem with "alpha"

Most of what gets sold as alpha falls into three buckets.

**Calls from people who already bought.** By the time a call reaches you, the person making it is usually in profit and looking for someone to sell to. Too often, that someone is you.

**Screenshots of PnL.** Easy to fake, easy to cherry-pick, impossible to verify. One winning trade gets posted. The ten losing ones don't.

**Wallet trackers that track the wrong wallets.** A wallet that made money once isn't smart money. Many "top wallets" are bots, insiders trading a token they launched themselves, or wash-trading farms whose profits only exist on paper.

The chain itself doesn't lie. Every trade, every entry and every exit is recorded, permanently, for anyone to read. What's been missing is a tool that reads it honestly, throws out the noise, and puts the result in front of you while it still matters.

**Heading:** What Oxbow does

**A live feed of smart money.** Every trade from tracked wallets as it happens: the token, buy or sell, the size, the price paid and the USD value. Filter out small trades, or switch to a feed of only the wallets you follow. Wallets that earned their place through Oxbow's checks carry a SMART badge.

**One-tap copy trading.** See a buy you like, tap Copy, pick an amount and approve it in your wallet. Buy any token with SOL, or sell it back to SOL. Trades route through Jupiter, which searches every major market on Solana for the best price, pump.fun and PumpSwap included.

**Wallet pages that show the full picture.** A 30-day leaderboard ranked by realized profit. For every wallet: realized and unrealized PnL, win rate, current holdings checked against the chain, and every closed position, so you can see how it really trades, not just its best moment.

**Token pages with a safety check.** Price, market cap, liquidity, holder count and age, plus an automatic check of what most often goes wrong with new tokens: whether the developer can still mint more supply or freeze your tokens, how concentrated the holders are, how much the developer holds, whether the trading is organic, and whether Jupiter has verified the token. You also see which tracked wallets are holding it.

**Order flow.** Solana tokens trade in liquidity pools, so there's no traditional order book to look at. Oxbow builds the next best thing: the latest fills from every trader in a token, read from the chain and grouped by price level, with buy pressure against sell pressure at a glance.

**Limit orders.** Don't want to buy at the current price? Set a lower price to buy at, or a higher one to sell at, using Jupiter's limit orders, right from the trade panel. Your open orders are listed there and can be cancelled anytime.

**Alerts.** Turn on notifications for the wallets you follow, and your browser tells you the moment one of them trades.

**Bring your own wallets.** Already watching a wallet? Paste its address and Oxbow starts tracking it, with the same live trades, PnL and history as every other wallet.

**Heading:** How Oxbow reads a trade

Getting the basics right matters more than any feature, so here is how a trade gets into your feed.

Oxbow doesn't try to understand every exchange's instructions one by one. Instead, it looks at what actually happened to the wallet's balances in a transaction the wallet signed itself. SOL went out and a token came in: that's a buy. A token went out and SOL or a stablecoin came in: that's a sell. Because it reads the result rather than the route, every market and aggregator on Solana is handled the same way.

The details are handled carefully. Wrapped SOL counts as SOL. The small rent deposits Solana charges for token accounts are taken out, so they don't distort the price you see. Fee-sized movements are ignored. Transfers, airdrops and liquidity deposits are not trades and never show up as one.

Each tracked wallet has a live connection to the chain, so its trades appear within seconds. A catch-up pass runs regularly in the background, so nothing slips through even if a connection drops.

**Heading:** How Oxbow finds smart money

"Smart money" is easy to claim and hard to prove. Most wallets that look profitable aren't worth copying. So Oxbow doesn't take anyone's word for it, including its own. Every wallet has to prove itself from its own on-chain history.

**Subheading:** Where candidates come from

Oxbow continuously looks at who is trading right now:

- The wallets that got into winning trades early: for tokens where a known smart wallet made money, who bought just before it did.
- People swapping through Jupiter, where most real traders' swaps go.
- Traders on pump.fun and PumpSwap, where trading terminals send memecoin orders directly.
- The traders of the busiest tokens on Solana, starting with those who just took profit.

Only traders with real size are considered, and any wallet that shows up again and again in a few seconds of activity is skipped as a bot straight away.

**Subheading:** Judged on its own history

Every candidate's recent transactions are read straight from the chain and priced exactly the way a tracked wallet's are. Then the filters start.

Bots are thrown out first. Wallets whose transactions mostly fail are sniper and arbitrage bots firing attempts at the chain. Wallets that trade faster than any person could are automated. Wallets that buy and sell the same token within a slot or two are sandwiching other traders. None of them belong in a feed meant for people.

Idle wallets are thrown out next. A wallet that hasn't made a single swap in the last week might have a great history, but it's not going to give you anything to follow today.

**Subheading:** What it takes to pass

What's left has to earn its place in one of two ways:

- **Consistent:** at least three positions closed, at least half of them in profit, and at least $150 of realized profit.
- **Big win:** at least $1,500 of realized profit, with no more losing positions than winning ones. Large traders often close just one or two positions, for a lot.

And one more rule, which turned out to be the most important of all: a real part of that profit has to come from tokens with genuine trading behind them, meaning tokens Jupiter sees organic activity in, has verified, or that have a deep market.

**Subheading:** The farm we almost followed

That last rule exists because of something we found while testing Oxbow.

One discovery run flagged 97 new profitable wallets in eight minutes. It looked like a breakthrough. It wasn't.

About 90 of them were a single operation: dozens of wallets trading the same freshly launched tokens within seconds of launch. Two different tokens shared one name; four more shared another. Within minutes, the liquidity in those tokens was gone. On paper, the winners in that group were profitable. In reality, anyone copying them would have been buying rugs.

So Oxbow now checks where a wallet's profit actually comes from. After that change, the next runs found 20 new wallets, and the whole tracked set was trading more than 500 different tokens, with no cluster in sight.

This is exactly why "smart money" lists can be dangerous, and why Oxbow treats every wallet as unproven until its own history says otherwise.

**Subheading:** Checked again, every day

Passing once isn't enough. Every discovered wallet is checked again daily. Wallets that start acting like bots, that only earn in tokens nobody else trades, or that close more losing positions than winning ones over two weeks are dropped. The list keeps growing, and it keeps getting cleaned.

**Heading:** How PnL is calculated

Numbers you can't trust are worse than no numbers, so here's exactly how Oxbow counts.

Profit uses average cost: every buy adds to a position's cost, and every sell realizes profit or loss against the average price paid. Realized PnL is money actually taken off the table. Unrealized PnL is what open positions are worth now, at today's price.

If a wallet sells more of a token than Oxbow saw it buy, there's no honest way to know what that extra cost, so it's left out instead of counted as profit. USD values use the SOL price at the moment the trade was read. Holdings are checked against the wallet's real balances on chain.

The leaderboard ranks wallets by realized profit over the last 30 days, because realized profit is the part that can't disappear on the next candle.

**Heading:** Copying a trade, step by step

From seeing a trade to owning the token takes about half a minute:

1. Open the live feed on oxbowflow.com.
2. Tap Copy on any trade, or Buy and Sell on a token's page.
3. Pick an amount: 0.1, 0.25, 0.5 or 1 SOL with a tap, or type your own. When selling, choose a percentage of what you hold.
4. Check the quote: what you get, the minimum you'll receive, the price impact, Oxbow's fee, the route and your slippage.
5. Connect your wallet if you haven't yet, and approve the trade in it.
6. Done. The trade usually confirms within seconds, with a link to see it on Solscan.

Oxbow works with Phantom, Solflare, Backpack and the other major Solana wallets.

**Heading:** Your keys, your coins

Oxbow is non-custodial. That's not a slogan, it's how the product is built.

**We never hold your funds.** Your SOL and tokens stay in your wallet. Oxbow can't move them, ever.

**We never ask for your seed phrase.** No one from Oxbow will ever ask for it, in the app or in DMs. Anyone who does is a scammer.

**Nothing moves without your approval.** Oxbow builds the transaction, your wallet shows it to you, and only you can sign it.

**Only known programs.** Before a transaction is handed to your wallet, Oxbow checks that it calls only the programs it should: Jupiter's router, Solana's token programs, and the system programs every transaction uses. Anything else, and the trade is refused.

**Checked before you sign.** Oxbow simulates every trade against your real balance before your wallet even opens. If it would fail, because the price moved past your slippage or you're short on SOL, you're told exactly why and nothing is sent.

**No accounts.** There's no sign-up and no email. The wallets you follow, your nicknames for them and your alert settings live in your own browser.

**Heading:** Fees

Following wallets, the live feed, wallet and token pages, order flow and alerts cost nothing.

When you trade, Oxbow charges a flat 0.5% of the SOL side of the trade. On a buy, it comes out of the SOL you put in, so you spend exactly the amount you chose. On a sell, it comes out of the SOL you receive. The fee is shown in the quote before you sign, and it's a plain SOL transfer inside the same transaction, visible to anyone who looks it up. Solana's own network fees are separate, and tiny.

**Heading:** What Oxbow is not

Oxbow is not a signal group, and it doesn't promise profits.

Smart wallets lose too. Even the best traders close losing positions, and a wallet that's been right ten times can be wrong the eleventh. Copying a trade a minute after it happened can mean a worse price than the wallet got, especially in small tokens. And memecoins can go to zero.

What Oxbow gives you is an honest, live view of what proven wallets are doing, plus the tools to act on it fast. The decision is always yours.

**Heading:** Getting the most out of Oxbow

A few habits make a real difference:

- **Start small.** Get a feel for how a wallet trades before you size up.
- **Follow several wallets.** One wallet is a coin flip. A few strong wallets buying the same token tells you much more.
- **Check the token page first.** Look at the safety check, the liquidity and who else is holding it.
- **Read the order flow.** Heavy selling right after a smart wallet buys is worth knowing about.
- **Don't chase.** If a token has already run far past the price the wallet paid, a limit order at a better price is often smarter than buying the top.
- **Set slippage for the token.** Fresh pump.fun tokens move fast; 3 to 10% slippage is often needed there, while established tokens need far less. If the price moves past your slippage, Oxbow tells you and offers a higher setting in one tap.

**Heading:** CA coming soon

There is no Oxbow token yet.

When there is, the contract address will be posted in only two places: here on @oxbowflow, and on oxbowflow.com, where it will replace the "CA Coming soon" you can see today. Anything else claiming to be the Oxbow token, in any chat, any DM, any reply, is fake.

**Heading:** FAQ

**Is Oxbow free?**
Watching, following and alerts are free. Trades carry a flat 0.5% fee on the SOL side, shown before you sign.

**Do I need an account?**
No. Just connect a Solana wallet when you want to trade. Follows and alerts are saved in your browser.

**Which wallets work?**
Phantom, Solflare, Backpack, and other major Solana wallets.

**Which tokens can I trade?**
Any token Jupiter can route against SOL, including pump.fun tokens still on their bonding curve.

**Can I track a wallet I found myself?**
Yes. Paste its address on the home page and Oxbow starts tracking it.

**How fast is the feed?**
Trades show up within seconds of landing on chain.

**What if my trade fails?**
Oxbow checks every trade before your wallet opens and tells you why if it would fail. If it fails on chain anyway, nothing is spent except Solana's tiny network fee.

**Where's the token?**
Coming soon. The CA will only ever be posted here and on oxbowflow.com.

**Heading:** Start following

Open oxbowflow.com and watch the feed for a minute. Look at a few wallets: their win rate, their closed positions, what they're holding right now. Follow the ones you like and turn on alerts.

When you're ready, copying a trade is one tap away.

Follow the wallets that move first.

oxbowflow.com

---

Not financial advice. Copying trades carries risk: smart wallets lose too, copied trades can fill at worse prices, and memecoins can go to zero. Only trade what you can afford to lose.

## Post to share the article

```
Introducing Oxbow 🌊

Follow the wallets that move first: every buy and sell from Solana's smart money, live, and copy any trade in one tap from your own wallet.

Bots and wash-trading farms filtered out. Non-custodial. No accounts.

The full story, and the farm we almost followed 👇
```
