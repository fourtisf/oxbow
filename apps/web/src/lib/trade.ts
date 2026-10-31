'use client';

/**
 * Copy trading from the browser: the API asks Jupiter for the route and
 * builds the transaction (with Oxbow's fee); the connected wallet signs it;
 * then we wait for the network to confirm it. Nothing is signed without the
 * wallet's own prompt.
 */
import { z } from 'zod';
import { BalancesSchema, BuiltLimitSchema, BuiltSwapSchema, SwapQuoteSchema, TxStatusSchema, txFailure, type LimitCreateBody, type SwapQuote, type SwapQuoteQuery } from '@oxbow/shared';
import { ApiError, get, post, qs } from './api/http';
import type { ConnectedWallet } from './store/wallet';
import { signAndSend, WalletError } from './wallets';

export type TradeErrorCode = 'REJECTED' | 'CANT_SIGN' | 'TX_FAILED' | 'TIMEOUT' | 'NO_ROUTE' | 'FAILED' | 'REJECTED_BY_JUPITER' | 'BUSY' | 'SLIPPAGE' | 'INSUFFICIENT_SOL' | 'EXPIRED';

/** What the API or the wallet said went wrong, as the panel's reasons. */
const FAILURE_CODES = { slippage: 'SLIPPAGE', insufficient_sol: 'INSUFFICIENT_SOL', expired: 'EXPIRED' } as const;

export class TradeError extends Error {
  constructor(
    readonly code: TradeErrorCode,
    /** Jupiter's own words, when it refused. */
    readonly detail = '',
  ) {
    super(code);
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const toB64 = (b: Uint8Array) => btoa(Array.from(b, (c) => String.fromCharCode(c)).join(''));

export function asTradeError(e: unknown): TradeError {
  if (e instanceof TradeError) return e;
  if (e instanceof ApiError && e.code === 'jupiter_busy') return new TradeError('BUSY');
  if (e instanceof ApiError && e.code === 'limit_rejected') return new TradeError('REJECTED_BY_JUPITER', String(e.details.detail ?? ''));
  if (e instanceof ApiError && e.code in FAILURE_CODES) return new TradeError(FAILURE_CODES[e.code as keyof typeof FAILURE_CODES], String(e.details.detail ?? ''));
  if (e instanceof WalletError) {
    if (e.code === 'REJECTED') return new TradeError('REJECTED');
    if (e.code === 'CANT_SIGN') return new TradeError('CANT_SIGN');
    // The wallet simulated it and refused: its message says why.
    const kind = txFailure(e.detail);
    return new TradeError(kind === 'failed' ? 'FAILED' : FAILURE_CODES[kind], e.detail);
  }
  if (e instanceof ApiError && (e.code === 'no_route' || e.code === 'sol_side_required')) return new TradeError('NO_ROUTE');
  if (e instanceof ApiError) return new TradeError('FAILED', String(e.details.detail ?? e.code));
  return new TradeError('FAILED', e instanceof Error ? e.message.slice(0, 200) : '');
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

/** Builds (through the API), signs, sends and confirms one transaction. `onStep` gets 0 (build), 1 (sign), 2 (confirm). */
async function signBuilt(wallet: ConnectedWallet, build: () => Promise<{ transaction: string }>, onStep: (step: number) => void): Promise<string> {
  try {
    onStep(0);
    const built = await build();
    onStep(1);
    const signature = await signAndSend(wallet.name, wallet.address, fromB64(built.transaction), async (signed) => {
      const r = await post('/api/tx/send', { transaction: toB64(signed) }, z.object({ signature: z.string() }));
      return r.signature;
    });
    onStep(2);
    await confirmed(signature);
    return signature;
  } catch (e) {
    const err = asTradeError(e);
    // The full story for whoever opens the console.
    console.warn('Trade not completed:', err.code, err.detail || '', e);
    throw err;
  }
}

/** One swap through Jupiter, Oxbow's fee included. Resolves with the signature and the quote it was built on. */
export async function executeSwap(wallet: ConnectedWallet, q: QuoteInput, onStep: (step: number) => void): Promise<{ signature: string; quote: SwapQuote }> {
  let quote: SwapQuote | null = null;
  const signature = await signBuilt(
    wallet,
    async () => {
      const built = await post('/api/swap/build', { ...q, amount: q.amount.toString(), wallet: wallet.address }, BuiltSwapSchema);
      quote = built.quote;
      return built;
    },
    onStep,
  );
  return { signature, quote: quote! };
}

/** Opens a limit order through Jupiter. Resolves with the signature. */
export function placeLimit(wallet: ConnectedWallet, body: Omit<LimitCreateBody, 'wallet'>, onStep: (step: number) => void) {
  return signBuilt(wallet, () => post('/api/limit/create', { ...body, wallet: wallet.address }, BuiltLimitSchema), onStep);
}

export function cancelLimit(wallet: ConnectedWallet, order: string, onStep: (step: number) => void = () => {}) {
  return signBuilt(wallet, () => post('/api/limit/cancel', { wallet: wallet.address, order }, BuiltLimitSchema), onStep);
}

/** "1.5" in UI units to raw units; extra decimals are cut, never rounded up. 0n when not a number. */
export function toRaw(ui: string, decimals: number): bigint {
  const m = /^(\d*)(?:\.(\d*))?$/.exec(ui.trim().replace(/,/g, ''));
  if (!m || (!m[1] && !m[2])) return 0n;
  return BigInt((m[1] || '0') + (m[2] ?? '').slice(0, decimals).padEnd(decimals, '0'));
}

export const fromRaw = (raw: string | bigint, decimals: number) => Number(BigInt(raw)) / 10 ** decimals;
