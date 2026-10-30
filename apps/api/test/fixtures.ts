/**
 * Test helpers: random addresses and signatures made for the run, and
 * synthetic swap transactions in the node's JSON encoding (the shape
 * `getTransaction` returns), for wallets and mints that exist only here.
 */
import { Keypair } from '@solana/web3.js';
import { bytesToBase58 } from '@oxbow/shared';
import { TOKEN_ACCOUNT_RENT, WSOL, type RawTx } from '../src/tracker/parse';

export const addr = () => Keypair.generate().publicKey.toBase58();
export const sig = () => bytesToBase58(Keypair.generate().secretKey);

export interface FakeSwap {
  wallet: string;
  signature: string;
  blockTime: number;
  /** The token side: positive = bought. Raw units. */
  mint: string;
  tokenDelta: bigint;
  decimals?: number;
  /** The money side: lamports of SOL, or a stablecoin's raw units when `quoteMint` is set. */
  quoteDelta: bigint;
  quoteMint?: string;
  /** The wallet opens (buy) or closes (sell) its token account in this transaction. */
  opensAccount?: boolean;
}

export function fakeSwapTx(s: FakeSwap): RawTx {
  const fee = 5000n;
  let solDelta = s.quoteMint ? 0n : s.quoteDelta;
  if (s.opensAccount) solDelta += s.tokenDelta > 0n ? -TOKEN_ACCOUNT_RENT : TOKEN_ACCOUNT_RENT;
  const pre = 50_000_000_000n;
  const bal = (accountIndex: number, mint: string, amount: bigint, decimals: number) => ({ accountIndex, mint, owner: s.wallet, uiTokenAmount: { amount: amount.toString(), decimals } });
  const start = 10n ** 15n;
  const preTokens = [];
  const postTokens = [];
  const d = s.decimals ?? 6;
  if (!(s.opensAccount && s.tokenDelta > 0n)) preTokens.push(bal(2, s.mint, s.tokenDelta > 0n ? start : -s.tokenDelta, d));
  if (!(s.opensAccount && s.tokenDelta < 0n)) postTokens.push(bal(2, s.mint, s.tokenDelta > 0n ? (s.opensAccount ? 0n : start) + s.tokenDelta : 0n, d));
  if (s.quoteMint) {
    preTokens.push(bal(3, s.quoteMint, start, 6));
    postTokens.push(bal(3, s.quoteMint, start + s.quoteDelta, 6));
  }
  return {
    slot: 400_000_000 + (s.blockTime % 1_000_000),
    blockTime: s.blockTime,
    transaction: { signatures: [s.signature], message: { accountKeys: [s.wallet, WSOL, addr(), addr()], header: { numRequiredSignatures: 1 } } },
    meta: {
      err: null,
      fee: Number(fee),
      preBalances: [Number(pre), 0, 0, 0],
      postBalances: [Number(pre + solDelta - fee), 0, 0, 0],
      preTokenBalances: preTokens,
      postTokenBalances: postTokens,
    },
  };
}
