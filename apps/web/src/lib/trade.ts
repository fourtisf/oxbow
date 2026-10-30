'use client';

/**
 * Copy trading from the browser: the API asks Jupiter for the route and
 * builds the transaction (with Oxbow's fee); the connected wallet signs it;
 * then we wait for the network to confirm it. Nothing is signed without the
 * wallet's own prompt.
 */
import { z } from 'zod';
import { BalancesSchema, BuiltSwapSchema, SwapQuoteSchema, TxStatusSchema, type SwapQuote, type SwapQuoteQuery } from '@oxbow/shared';
import { ApiError, get, post, qs } from './api/http';
import type { ConnectedWallet } from './store/wallet';
import { signAndSend, WalletError } from './wallets';

export type TradeErrorCode = 'REJECTED' | 'CANT_SIGN' | 'TX_FAILED' | 'TIMEOUT' | 'NO_ROUTE' | 'FAILED';

export class TradeError extends Error {
  constructor(readonly code: TradeErrorCode) {
    super(code);
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const toB64 = (b: Uint8Array) => btoa(Array.from(b, (c) => String.fromCharCode(c)).join(''));

export function asTradeError(e: unknown): TradeError {
  if (e instanceof TradeError) return e;
  if (e instanceof WalletError) return new TradeError(e.code === 'REJECTED' ? 'REJECTED' : e.code === 'CANT_SIGN' ? 'CANT_SIGN' : 'FAILED');
  if (e instanceof ApiError && (e.code === 'no_route' || e.code === 'sol_side_required')) return new TradeError('NO_ROUTE');
  return new TradeError('FAILED');
}

export type QuoteInput = Pick<SwapQuoteQuery, 'inputMint' | 'outputMint' | 'slippageBps'> & { amount: bigint };

export function getQuote(q: QuoteInput): Promise<SwapQuote> {
  return get(`/api/swap/quote${qs({ ...q, amount: q.amount.toString() })}`, SwapQuoteSchema);
}

/** UI-unit balances by mint (SOL under the wrapped SOL mint). */
export function getBalances(wallet: string, mints: string[]) {
  return get(`/api/wallet/${encodeURIComponent(wallet)}/balances?mints=${mints.map(encodeURIComponent).join(',')}`, BalancesSchema);
}

/** Waits until the network confirms `sig` (about 90 s at most). */
async function confirmed(sig: string): Promise<void> {
  const until = Date.now() + 90_000;
  while (Date.now() < until) {
    const { status } = await get(`/api/tx/${sig}`, TxStatusSchema).catch(() => ({ status: 'pending' as const }));
    if (status === 'confirmed') return;
    if (status === 'failed') throw new TradeError('TX_FAILED');
    await wait(1500);
  }
  throw new TradeError('TIMEOUT');
}

/** Builds, signs, sends and confirms one swap. `onStep` gets 0 (build), 1 (sign), 2 (confirm). Resolves with the signature. */
export async function executeSwap(wallet: ConnectedWallet, q: QuoteInput, onStep: (step: number, sig?: string) => void): Promise<{ signature: string; quote: SwapQuote }> {
  try {
    onStep(0);
    const built = await post('/api/swap/build', { ...q, amount: q.amount.toString(), wallet: wallet.address }, BuiltSwapSchema);
    onStep(1);
    const signature = await signAndSend(wallet.name, wallet.address, fromB64(built.transaction), async (signed) => {
      const r = await post('/api/tx/send', { transaction: toB64(signed) }, z.object({ signature: z.string() }));
      return r.signature;
    });
    onStep(2, signature);
    await confirmed(signature);
    return { signature, quote: built.quote };
  } catch (e) {
    throw asTradeError(e);
  }
}

/** "1.5" in UI units to raw units; extra decimals are cut, never rounded up. 0n when not a number. */
export function toRaw(ui: string, decimals: number): bigint {
  const m = /^(\d*)(?:\.(\d*))?$/.exec(ui.trim().replace(/,/g, ''));
  if (!m || (!m[1] && !m[2])) return 0n;
  return BigInt((m[1] || '0') + (m[2] ?? '').slice(0, decimals).padEnd(decimals, '0'));
}

export const fromRaw = (raw: string | bigint, decimals: number) => Number(BigInt(raw)) / 10 ** decimals;
