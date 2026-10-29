'use client';

/**
 * Real wallet actions (live data). The API builds each transaction and checks
 * balances and a dry run first; the creator's wallet signs it; the API then
 * reads the confirmed transaction from the chain to list the pool. Swaps and
 * liquidity management arrive in M4/M5.
 */
import { z } from 'zod';
import { BalancesSchema, BuiltTxSchema, PoolDetailSchema, TxStatusSchema } from '@oxbow/shared';
import { ApiError, get, post } from '../api/http';
import { useWallet } from '../store/wallet';
import { signAndSend, WalletError } from '../wallets';
import { ChainError, CREATE_STEPS, type Chain, type ChainErrorCode } from './types';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const toB64 = (b: Uint8Array) => btoa(Array.from(b, (c) => String.fromCharCode(c)).join(''));
/** UI amount as a plain decimal string (no exponent), the form the API takes. */
const dec = (n: number) => n.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 18 });

const API_CODES: Record<string, ChainErrorCode> = {
  insufficient_sol: 'INSUFFICIENT_SOL',
  insufficient_token: 'INSUFFICIENT_TOKEN',
  pool_exists: 'POOL_EXISTS',
  below_min_liquidity: 'MIN_LIQUIDITY',
  simulation_failed: 'SIMULATION',
  tx_failed: 'TX_FAILED',
  creation_disabled: 'NOT_READY',
};

function asChainError(e: unknown): ChainError {
  if (e instanceof ChainError) return e;
  if (e instanceof WalletError) return new ChainError(e.code === 'REJECTED' ? 'REJECTED' : e.code === 'CANT_SIGN' ? 'CANT_SIGN' : 'FAILED');
  if (e instanceof ApiError) return new ChainError(API_CODES[e.code] ?? 'FAILED', e.details);
  return new ChainError('FAILED');
}

/** Signs and sends a base64 transaction with the connected wallet; resolves with the signature. */
async function sign(transaction: string): Promise<string> {
  const w = useWallet.getState().wallet;
  if (!w) throw new ChainError('FAILED');
  return signAndSend(w.name, w.address, fromB64(transaction), async (signed) => {
    const r = await post('/api/tx/send', { transaction: toB64(signed) }, z.object({ signature: z.string() }));
    return r.signature;
  });
}

/** Waits until the network confirms `sig` (about 90 s at most). */
async function confirmed(sig: string): Promise<void> {
  const until = Date.now() + 90_000;
  while (Date.now() < until) {
    const { status } = await get(`/api/tx/${sig}`, TxStatusSchema).catch(() => ({ status: 'pending' as const }));
    if (status === 'confirmed') return;
    if (status === 'failed') throw new ChainError('TX_FAILED');
    await wait(1500);
  }
  throw new ChainError('TIMEOUT');
}

/** The API's RPC can lag the wallet's by a few seconds: retry "not confirmed yet". */
async function untilIndexed<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (!(e instanceof ApiError && e.code === 'not_confirmed') || i >= 10) throw e;
      await wait(2000);
    }
  }
}

const notReady = async (): Promise<never> => {
  throw new ChainError('NOT_READY');
};

export const liveChain: Chain = {
  async balances(wallet, mints) {
    if (!mints.length) return {};
    return get(`/api/wallet/${encodeURIComponent(wallet)}/balances?mints=${mints.map(encodeURIComponent).join(',')}`, BalancesSchema);
  },

  async createPool(wallet, p, onStep) {
    try {
      // 1. The server checks the price feed, balances and a dry run, then builds the transaction.
      onStep(0);
      const built = await post(
        '/api/pools/build',
        { creator: wallet, baseMint: p.token.mint, quoteMint: p.quote.mint, baseAmount: dec(p.baseAmount), quoteAmount: dec(p.quoteAmount), feeBps: p.feeBps, venue: p.venue },
        BuiltTxSchema,
      );
      // 2. The creator approves it in their wallet.
      onStep(1);
      const sig = await sign(built.transaction);
      // 3. Confirmed on chain, then listed from what the chain says.
      onStep(2);
      await confirmed(sig);
      const pool = await untilIndexed(() => post('/api/pools/register', { signature: sig, venue: p.venue }, PoolDetailSchema));
      // 4. Burn the LP (a second approval). The pool stays listed if this is cancelled.
      onStep(3);
      let lockSkipped = false;
      if (p.lock.kind === 'burn') {
        try {
          const burn = await post(`/api/pools/${pool.address}/burn`, { creator: wallet }, BuiltTxSchema);
          const burnSig = await sign(burn.transaction);
          await confirmed(burnSig);
          await untilIndexed(() => post(`/api/pools/${pool.address}/lock`, { signature: burnSig }, PoolDetailSchema));
        } catch {
          lockSkipped = true;
        }
      }
      onStep(4);
      onStep(CREATE_STEPS.length);
      return { address: pool.address, lockSkipped };
    } catch (e) {
      throw asChainError(e);
    }
  },

  swap: notReady,
  addLiquidity: notReady,
  claimFees: notReady,
  withdraw: notReady,
};
