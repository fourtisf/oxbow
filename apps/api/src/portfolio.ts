/**
 * Portfolio: any wallet's SOL, tokens and recent trades, read straight from the
 * chain. It is for the connected wallet's own page, so the wallet is not
 * tracked: its trades never appear in the public feed or the leaderboard.
 *
 * Holdings are the wallet's token accounts (both token programs) priced with
 * Jupiter's data. Cost and profit come from the trades in its latest
 * transactions (one bulk read where the RPC provider allows), counted with the
 * same average-cost rules as tracked wallets; tokens that arrived some other way
 * show no cost rather than a made-up one.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PublicKey, type Connection } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { AddressSchema, type Portfolio, type PortfolioHolding } from '@oxbow/shared';
import type { Cache } from './cache';
import { priv, withTimeout } from './http';
import { priceTrades } from './tracker/history';
import { WSOL } from './tracker/parse';
import { openPart, positions } from './tracker/pnl';
import { readHistory, type TrackerRpc } from './tracker/rpc';
import { brief, STALE, type TokenBook } from './tracker/tokens';

export type PortfolioRpc = Pick<Connection, 'getBalance' | 'getParsedTokenAccountsByOwner'>;

/** Transactions read for trades and cost: one bulk request on Helius. */
const HISTORY_TXS = 100;
const RECENT_TRADES = 30;
const RPC_MS = 8000;
/** Holdings worth less than this are left out (dust and spam airdrops), unless the wallet traded them. */
const DUST_USD = 0.01;

export function registerPortfolioRoutes(app: FastifyInstance, d: { rpc: PortfolioRpc; trackerRpc?: TrackerRpc; tokens: TokenBook; cache: Cache; now: () => number }) {
  async function tokenBalances(owner: PublicKey): Promise<Map<string, { amount: number; decimals: number }>> {
    const lists = await Promise.all([TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID].map((programId) => withTimeout(d.rpc.getParsedTokenAccountsByOwner(owner, { programId }), RPC_MS)));
    const out = new Map<string, { amount: number; decimals: number }>();
    for (const l of lists)
      for (const a of l.value) {
        const info = (a.account.data.parsed as { info?: { mint?: string; tokenAmount?: { uiAmount?: number | null; decimals?: number } } }).info;
        if (!info?.mint || info.mint === WSOL) continue;
        const prev = out.get(info.mint);
        out.set(info.mint, { amount: (prev?.amount ?? 0) + Number(info.tokenAmount?.uiAmount ?? 0), decimals: info.tokenAmount?.decimals ?? prev?.decimals ?? 0 });
      }
    return out;
  }

  async function portfolio(address: string): Promise<Portfolio> {
    const owner = new PublicKey(address);
    const [lamports, held, history] = await Promise.all([
      withTimeout(d.rpc.getBalance(owner), RPC_MS),
      tokenBalances(owner),
      d.trackerRpc ? readHistory(d.trackerRpc, address, { limit: HISTORY_TXS }).catch(() => null) : Promise.resolve(null),
    ]);
    const priced = history ? await priceTrades(address, history.entries, d.tokens) : null;
    const trades = [...(priced?.trades ?? [])].sort((a, b) => a.slot - b.slot);
    const pos = positions(trades);

    const decimals = new Map([...held].map(([m, h]) => [m, h.decimals]));
    const metas = await d.tokens.get([...new Set([...held.keys(), ...pos.keys()])], STALE.list, decimals);
    const solUsd = await d.tokens.solPrice();
    const sol = lamports / 1e9;

    const holdings: PortfolioHolding[] = [];
    for (const [mint, h] of held) {
      if (h.amount <= 0) continue;
      const meta = metas.get(mint);
      const px = meta?.usdPrice ?? null;
      const value = px === null ? null : h.amount * px;
      const p = pos.get(mint);
      if (!p && value !== null && value < DUST_USD) continue;
      const open = p ? openPart(p, h.amount) : null;
      const cost = open ? open.cost : null;
      const known = cost !== null && value !== null && open !== null && open.qty >= h.amount * 0.999;
      holdings.push({
        token: brief(meta, mint),
        amount: h.amount,
        priceUsd: px,
        valueUsd: value,
        costUsd: known ? cost : null,
        pnlUsd: known ? value! - cost! : null,
        pnlPct: known && cost! > 0 ? ((value! - cost!) / cost!) * 100 : null,
      });
    }
    holdings.sort((a, b) => (b.valueUsd ?? -1) - (a.valueUsd ?? -1));

    let realized = 0;
    for (const p of pos.values()) realized += p.realized;
    const solValue = solUsd === null ? null : sol * solUsd;
    return {
      address,
      sol: { amount: sol, valueUsd: solValue },
      totalUsd: (solValue ?? 0) + holdings.reduce((s, h) => s + (h.valueUsd ?? 0), 0),
      unrealizedPnlUsd: holdings.reduce((s, h) => s + (h.pnlUsd ?? 0), 0),
      realizedPnlUsd: realized,
      holdings: holdings.slice(0, 100),
      trades: [...trades]
        .reverse()
        .slice(0, RECENT_TRADES)
        .map((t) => ({ signature: t.signature, side: t.side, token: brief(metas.get(t.mint) ?? priced?.metas.get(t.mint), t.mint), amount: t.amount, usd: t.usd, ts: t.ts.toISOString() })),
      historyTxs: history?.entries.length ?? 0,
      updatedAt: new Date(d.now()).toISOString(),
    };
  }

  app.get('/api/portfolio/:address', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply): Promise<Portfolio> => {
    const { address } = z.object({ address: AddressSchema }).parse(req.params);
    priv(reply);
    // Short: right after a trade the page asks again and should see it.
    return d.cache.wrap(`portfolio:v1:${address}`, 8, () => portfolio(address));
  });
}
