/**
 * The swap parser against real mainnet transactions (raw `getTransaction`
 * JSON in test/fixtures): SOL buys and sells, stablecoin trades, a
 * token-for-token swap, and the signer-only rule.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseTrades, walletChanges, WSOL, type RawTx } from '../src/tracker/parse';

const dir = new URL('./fixtures/', import.meta.url);
const load = (name: string) => JSON.parse(readFileSync(new URL(`${name}.json`, dir), 'utf8')) as RawTx;
// The USD Coin mint, as it appears in these transactions' token balances.
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const isQuote = (m: string) => m === USDC;
const signer = (tx: RawTx) => tx.transaction.message.accountKeys[0]!;

function trades(name: string) {
  const tx = load(name);
  return parseTrades(tx, signer(tx), isQuote).map((t) => ({ ...t, mint: t.mint.slice(0, 4), quoteMint: t.quoteMint === WSOL ? 'SOL' : t.quoteMint === USDC ? 'USDC' : t.quoteMint.slice(0, 4) }));
}

describe('parseTrades on mainnet transactions', () => {
  it('reads a memecoin bought with SOL', () => {
    expect(trades('7nucxbYtSjsm')).toEqual([{ side: 'BUY', mint: '2zMM', amount: 3072803186n, decimals: 6, quoteMint: 'SOL', quoteAmount: 231360106n, quoteDecimals: 9 }]);
  });
  it('reads a memecoin sold for SOL', () => {
    expect(trades('3ZXCkxQD3dDP')).toMatchObject([{ side: 'SELL', mint: '4kjr', amount: 653815286107n, quoteMint: 'SOL', quoteAmount: 103153383n }]);
  });
  it('reads a small SOL buy', () => {
    expect(trades('5Whf9CbKTVQL')).toMatchObject([{ side: 'BUY', mint: '6p6x', amount: 641306n, quoteMint: 'SOL', quoteAmount: 9819707n }]);
  });
  it('reads trades paid in a stablecoin', () => {
    expect(trades('Jm7Rtp52pWZM')).toMatchObject([{ side: 'BUY', mint: 'moon', amount: 36476n, quoteMint: 'USDC', quoteAmount: 10000n, quoteDecimals: 6 }]);
    expect(trades('3roMWQADj3Yv')).toMatchObject([{ side: 'SELL', mint: 'SKRb', amount: 1000000n, quoteMint: 'USDC', quoteAmount: 13254n }]);
  });
  it('splits a token-for-token swap into a sell and a buy', () => {
    expect(trades('2XsW6QCGgWkm')).toMatchObject([
      { side: 'BUY', mint: '49VZ', amount: 12544051143n, quoteMint: '2zMM', quoteAmount: 103650000n },
      { side: 'SELL', mint: '2zMM', amount: 103650000n, quoteMint: '49VZ', quoteAmount: 12544051143n },
    ]);
  });
  it('ignores wallets that only appear in a transaction without signing it', () => {
    for (const f of readdirSync(dir)) {
      const tx = load(f.replace('.json', ''));
      const bystander = tx.transaction.message.accountKeys[tx.transaction.message.header.numRequiredSignatures]!;
      expect(walletChanges(tx, bystander)).toBeNull();
    }
  });
  it('ignores failed transactions', () => {
    const tx = load('7nucxbYtSjsm');
    expect(parseTrades({ ...tx, meta: { ...tx.meta!, err: { InstructionError: [0, 'Custom'] } } }, signer(tx), isQuote)).toEqual([]);
  });
});

describe('parseTrades rules', () => {
  const W = 'Wa11et1111111111111111111111111111111111111';
  const MINT = 'Mint111111111111111111111111111111111111111';
  const OTHER = 'Other11111111111111111111111111111111111111';
  const tx = (solDelta: number, tokens: { mint: string; pre: number | null; post: number | null }[]): RawTx => ({
    slot: 1,
    blockTime: 1_793_000_000,
    transaction: { signatures: ['s'], message: { accountKeys: [W, 'Pool111111111111111111111111111111111111111'], header: { numRequiredSignatures: 1 } } },
    meta: {
      err: null,
      fee: 5000,
      preBalances: [10_000_000_000, 0],
      postBalances: [10_000_000_000 + solDelta - 5000, 0],
      preTokenBalances: tokens.flatMap((t, i) => (t.pre === null ? [] : [{ accountIndex: i + 2, mint: t.mint, owner: W, uiTokenAmount: { amount: String(t.pre), decimals: 6 } }])),
      postTokenBalances: tokens.flatMap((t, i) => (t.post === null ? [] : [{ accountIndex: i + 2, mint: t.mint, owner: W, uiTokenAmount: { amount: String(t.post), decimals: 6 } }])),
    },
  });

  it('does not count the rent of a new token account as part of the price', () => {
    // Paid 0.5 SOL plus 0.00203928 SOL rent for the token account it opened.
    const [t] = parseTrades(tx(-502_039_280, [{ mint: MINT, pre: null, post: 1000 }]), W, () => false);
    expect(t).toMatchObject({ side: 'BUY', quoteAmount: 500_000_000n, amount: 1000n });
  });
  it('adds the rent back when a sale closes the token account', () => {
    const [t] = parseTrades(tx(302_039_280, [{ mint: MINT, pre: 1000, post: null }]), W, () => false);
    expect(t).toMatchObject({ side: 'SELL', quoteAmount: 300_000_000n });
  });
  it('treats fee-sized SOL moves as noise, not payment', () => {
    expect(parseTrades(tx(-500_000, [{ mint: MINT, pre: 0, post: 1000 }]), W, () => false)).toEqual([]);
  });
  it('is not a trade when tokens and SOL move the same way (transfers, airdrops, liquidity)', () => {
    expect(parseTrades(tx(400_000_000, [{ mint: MINT, pre: 0, post: 1000 }]), W, () => false)).toEqual([]);
    expect(parseTrades(tx(0, [{ mint: MINT, pre: 0, post: 1000 }, { mint: OTHER, pre: 0, post: 5 }]), W, () => false)).toEqual([]);
  });
});
