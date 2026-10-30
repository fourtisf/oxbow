/**
 * Reads a wallet's buys and sells out of a confirmed transaction, from the
 * balance changes alone: what the wallet's SOL and token balances were before
 * and after. That works for every DEX and aggregator (Raydium, Pump, Meteora,
 * Orca, Jupiter routes) without decoding any of their instructions.
 *
 * Input is the raw JSON-RPC `getTransaction` result (encoding "json"), so the
 * same code reads RPC answers, saved fixtures and webhook payloads.
 */

/** Wrapped SOL: counted together with native SOL. */
export const WSOL = 'So11111111111111111111111111111111111111112';
/** Rent a token account holds; a buy that opens one pays it, a sell that closes one gets it back. */
export const TOKEN_ACCOUNT_RENT = 2_039_280n;

interface TokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: { amount: string; decimals: number };
}

export interface RawTx {
  slot: number;
  blockTime: number | null;
  transaction: {
    signatures: string[];
    message: { accountKeys: string[]; header: { numRequiredSignatures: number } };
  };
  meta: {
    err: unknown;
    fee: number;
    preBalances: number[];
    postBalances: number[];
    preTokenBalances?: TokenBalance[] | null;
    postTokenBalances?: TokenBalance[] | null;
    loadedAddresses?: { writable: string[]; readonly: string[] } | null;
  } | null;
}

export interface Leg {
  mint: string;
  /** Raw base units; positive = received. */
  delta: bigint;
  decimals: number;
}

export interface ParsedTrade {
  side: 'BUY' | 'SELL';
  mint: string;
  /** Raw base units of the token bought or sold (positive). */
  amount: bigint;
  decimals: number;
  /** What paid for it or what came back: SOL or another token. */
  quoteMint: string;
  quoteAmount: bigint;
  quoteDecimals: number;
}

/** The wallet's net SOL and per-token changes in `tx`, or null when the wallet didn't sign it or it failed. */
export function walletChanges(tx: RawTx, wallet: string): { sol: bigint; tokens: Leg[] } | null {
  if (!tx.meta || tx.meta.err) return null;
  const msg = tx.transaction.message;
  const keys = [...msg.accountKeys, ...(tx.meta.loadedAddresses?.writable ?? []), ...(tx.meta.loadedAddresses?.readonly ?? [])];
  const idx = keys.indexOf(wallet);
  // Only the wallet's own transactions: it must have signed.
  if (idx < 0 || idx >= msg.header.numRequiredSignatures) return null;

  let sol = BigInt(tx.meta.postBalances[idx]! - tx.meta.preBalances[idx]!);
  if (idx === 0) sol += BigInt(tx.meta.fee);

  const byAccount = new Map<number, { mint: string; decimals: number; pre: bigint; post: bigint }>();
  const add = (list: TokenBalance[] | null | undefined, which: 'pre' | 'post') => {
    for (const b of list ?? []) {
      if (b.owner !== wallet) continue;
      const row = byAccount.get(b.accountIndex) ?? { mint: b.mint, decimals: b.uiTokenAmount.decimals, pre: 0n, post: 0n };
      row[which] = BigInt(b.uiTokenAmount.amount);
      byAccount.set(b.accountIndex, row);
    }
  };
  add(tx.meta.preTokenBalances, 'pre');
  add(tx.meta.postTokenBalances, 'post');

  const preIdx = new Set((tx.meta.preTokenBalances ?? []).filter((b) => b.owner === wallet).map((b) => b.accountIndex));
  const postIdx = new Set((tx.meta.postTokenBalances ?? []).filter((b) => b.owner === wallet).map((b) => b.accountIndex));
  const byMint = new Map<string, Leg>();
  for (const [i, r] of byAccount) {
    // Opening a token account costs its rent in SOL; closing one returns it. Neither is part of the trade.
    if (!preIdx.has(i) && postIdx.has(i)) sol += TOKEN_ACCOUNT_RENT;
    if (preIdx.has(i) && !postIdx.has(i)) sol -= TOKEN_ACCOUNT_RENT;
    const leg = byMint.get(r.mint) ?? { mint: r.mint, delta: 0n, decimals: r.decimals };
    leg.delta += r.post - r.pre;
    byMint.set(r.mint, leg);
  }
  // Wrapped SOL is SOL.
  const wsol = byMint.get(WSOL);
  if (wsol) {
    sol += wsol.delta;
    byMint.delete(WSOL);
  }
  return { sol, tokens: [...byMint.values()].filter((l) => l.delta !== 0n) };
}

/** Moves smaller than this many lamports are fees, tips and rounding, not a payment. */
const SOL_NOISE = 1_000_000n; // 0.001 SOL
/** Up to this much SOL can ride along a token-for-token swap (priority tips) without being part of it. */
const SOL_TIP_MAX = 50_000_000n; // 0.05 SOL

const abs = (v: bigint) => (v < 0n ? -v : v);

/**
 * The wallet's trades in `tx`. `isQuote` says which tokens count as money (stablecoins);
 * SOL always does. A token-for-token swap gives a SELL and a BUY.
 */
export function parseTrades(tx: RawTx, wallet: string, isQuote: (mint: string) => boolean): ParsedTrade[] {
  const ch = walletChanges(tx, wallet);
  if (!ch) return [];
  const quotes = ch.tokens.filter((l) => isQuote(l.mint));
  const coins = ch.tokens.filter((l) => !isQuote(l.mint));
  const coin = coins.length === 1 ? coins[0]! : null;
  const against = (l: { delta: bigint }) => !!coin && (l.delta > 0n) !== (coin.delta > 0n);

  // What paid for the coin: a stablecoin moving the other way comes first (SOL beside it, up to a tip's
  // size, is a tip), then SOL beyond the noise floor.
  const stable = quotes.filter(against);
  const sol: Leg = { mint: WSOL, delta: ch.sol, decimals: 9 };
  // Paid in a stablecoin and more SOL than a tip, both: no single price to read, so not a trade we can value.
  if (stable.length && against(sol) && abs(ch.sol) > SOL_TIP_MAX) return [];
  const money: Leg | null = stable.length === 1 ? stable[0]! : abs(ch.sol) > SOL_NOISE && against(sol) ? sol : null;

  const trade = (coin: Leg, quote: Leg): ParsedTrade => ({
    side: coin.delta > 0n ? 'BUY' : 'SELL',
    mint: coin.mint,
    amount: coin.delta > 0n ? coin.delta : -coin.delta,
    decimals: coin.decimals,
    quoteMint: quote.mint,
    quoteAmount: quote.delta > 0n ? quote.delta : -quote.delta,
    quoteDecimals: quote.decimals,
  });

  if (coin && money) return [trade(coin, money)];
  if (coins.length === 2 && !quotes.length && abs(ch.sol) <= SOL_TIP_MAX) {
    // Token for token: each side priced against the other.
    const [a, b] = coins as [Leg, Leg];
    if ((a.delta > 0n) === (b.delta > 0n)) return [];
    return [trade(a, b), trade(b, a)];
  }
  // Transfers, airdrops, liquidity moves and anything else: not a trade.
  return [];
}
