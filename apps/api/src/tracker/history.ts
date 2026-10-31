/**
 * A wallet's trades out of a history it read (rpc.ts `readHistory`), priced the
 * way tracked wallets' trades are: discovery judges candidates with it, and the
 * portfolio shows any wallet's recent trades and costs with it.
 */
import { ui } from './ingest';
import { parseTrades, walletChanges, WSOL, type RawTx } from './parse';
import type { PnlTrade } from './pnl';
import type { HistoryEntry } from './rpc';
import { quoteUsd, STALE, type TokenBook, type TokenMeta } from './tokens';

export type PricedTrade = PnlTrade & { slot: number; signature: string };

export async function priceTrades(
  address: string,
  entries: readonly HistoryEntry[],
  tokens: TokenBook,
): Promise<{ txs: Map<string, RawTx>; metas: ReadonlyMap<string, TokenMeta>; trades: PricedTrade[] }> {
  const txs = new Map<string, RawTx>();
  for (const e of entries) if (e.tx && !e.err) txs.set(e.signature, e.tx);
  const decimals = new Map<string, number>();
  for (const tx of txs.values()) for (const l of walletChanges(tx, address)?.tokens ?? []) decimals.set(l.mint, l.decimals);
  const metas = await tokens.get([...decimals.keys(), WSOL], STALE.ingest, decimals);
  const solUsd = await tokens.solPrice();
  const trades: PricedTrade[] = [];
  for (const [signature, tx] of txs) {
    for (const t of parseTrades(tx, address, (m) => metas.get(m)?.stable === true)) {
      const px = quoteUsd(t.quoteMint, metas, solUsd);
      if (px === null) continue;
      trades.push({ signature, ts: new Date((tx.blockTime ?? 0) * 1000), slot: tx.slot, side: t.side, mint: t.mint, amount: ui(t.amount, t.decimals), usd: ui(t.quoteAmount, t.quoteDecimals) * px });
    }
  }
  return { txs, metas, trades };
}
