/**
 * Wallet performance from its trades, average-cost method: a buy adds to the
 * position at its USD cost; a sell takes out its share of that cost, and the
 * difference from what it sold for is realized profit or loss. Sells of more
 * than Oxbow saw bought (tokens received some other way, or bought before
 * tracking started) count only up to what was seen; the rest has no known
 * cost and is left out rather than counted as pure profit.
 */

export interface PnlTrade {
  ts: Date;
  side: 'BUY' | 'SELL';
  mint: string;
  /** UI units. */
  amount: number;
  usd: number;
}

export interface Position {
  mint: string;
  /** UI units held, from trades. */
  qty: number;
  /** USD cost of `qty`. */
  cost: number;
  boughtQty: number;
  boughtUsd: number;
  soldUsd: number;
  realized: number;
  /** Some of what was sold had been bought while tracked, so it counts toward the win rate. */
  matched: boolean;
  buys: number;
  sells: number;
  lastTradeAt: Date;
}

/** Positions per mint. `trades` must be oldest first. */
export function positions(trades: readonly PnlTrade[]): Map<string, Position> {
  const out = new Map<string, Position>();
  for (const t of trades) {
    let p = out.get(t.mint);
    if (!p) {
      p = { mint: t.mint, qty: 0, cost: 0, boughtQty: 0, boughtUsd: 0, soldUsd: 0, realized: 0, matched: false, buys: 0, sells: 0, lastTradeAt: t.ts };
      out.set(t.mint, p);
    }
    p.lastTradeAt = t.ts;
    if (t.side === 'BUY') {
      p.buys++;
      p.qty += t.amount;
      p.cost += t.usd;
      p.boughtQty += t.amount;
      p.boughtUsd += t.usd;
      continue;
    }
    p.sells++;
    p.soldUsd += t.usd;
    if (p.qty <= 0 || t.amount <= 0) continue;
    const sold = Math.min(t.amount, p.qty);
    const costOut = p.cost * (sold / p.qty);
    p.realized += t.usd * (sold / t.amount) - costOut;
    p.matched = true;
    p.qty -= sold;
    p.cost -= costOut;
    // Rounding leftovers of a full exit.
    if (p.qty <= p.boughtQty * 1e-9) {
      p.qty = 0;
      p.cost = 0;
    }
  }
  return out;
}

/** Still holding: more than 0.1% of what was bought is left. */
export const isOpen = (p: Position) => p.qty > 0 && p.qty > p.boughtQty * 0.001;

export interface Summary {
  trades: number;
  buys: number;
  sells: number;
  volumeUsd: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  winRate: number | null;
  wins: number;
  losses: number;
  tokensTraded: number;
}

/**
 * Totals across positions. `price` gives today's USD price per mint (null when unknown);
 * `held` caps each position at the wallet's balance on chain when known.
 */
export function summarize(pos: Iterable<Position>, price: (mint: string) => number | null, held?: (mint: string) => number | null): Summary {
  const s: Summary = { trades: 0, buys: 0, sells: 0, volumeUsd: 0, realizedPnlUsd: 0, unrealizedPnlUsd: 0, winRate: null, wins: 0, losses: 0, tokensTraded: 0 };
  for (const p of pos) {
    s.tokensTraded++;
    s.buys += p.buys;
    s.sells += p.sells;
    s.volumeUsd += p.boughtUsd + p.soldUsd;
    s.realizedPnlUsd += p.realized;
    if (p.matched) {
      if (p.realized > 0) s.wins++;
      else s.losses++;
    }
    const open = openPart(p, held?.(p.mint) ?? null);
    const px = price(p.mint);
    if (open && px !== null) s.unrealizedPnlUsd += open.qty * px - open.cost;
  }
  s.trades = s.buys + s.sells;
  s.winRate = s.wins + s.losses ? s.wins / (s.wins + s.losses) : null;
  return s;
}

/** What is still held of `p` and what it cost, capped by the on-chain balance when known. */
export function openPart(p: Position, onChain: number | null): { qty: number; cost: number } | null {
  if (!isOpen(p)) return null;
  if (onChain === null || onChain >= p.qty) return { qty: p.qty, cost: p.cost };
  if (onChain <= p.boughtQty * 0.001) return null;
  return { qty: onChain, cost: p.cost * (onChain / p.qty) };
}
