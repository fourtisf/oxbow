'use client';

import {
  amt,
  compactTrim,
  isAddress,
  NETWORK_RENT_SOL,
  num,
  poolLiquidityUsd,
  startingPrice,
  venueInfo,
  type QuoteAsset,
  type TokenInfo,
} from '@oxbow/shared';
import { useQuotes, useToken } from '@/lib/api/queries';
import { useBalances } from '@/lib/chain/hooks';
import type { LockChoice } from '@/lib/chain/types';
import { oxbowFeeSol } from '@/lib/env';
import { useDebounced } from '@/lib/hooks';
import { useCreateForm, type CreateForm } from '@/lib/store/create';
import { useWallet } from '@/lib/store/wallet';
import type { LpBadgeInput } from '../ui/primitives';

export type LookupState = 'empty' | 'invalid' | 'loading' | 'missing' | 'error' | 'ok';

export interface CreateModel {
  form: CreateForm;
  lookup: LookupState;
  token: TokenInfo | null;
  quotes: QuoteAsset[];
  quote: QuoteAsset | null;
  /** Wallet balances (0 when disconnected). */
  baseBal: number;
  quoteBal: number;
  b: number;
  qa: number;
  /** First thing blocking creation, shown under the button. Empty when ready. */
  msg: string;
  /** Per-step "done" flags for the five steps. */
  done: [boolean, boolean, boolean, boolean, boolean];
  baseOver: boolean;
  quoteOver: boolean;
  /** Starting price in quote units and USD, liquidity and market cap. */
  priceQ: number;
  priceU: number;
  liq: number;
  mcap: number;
  lp: LpBadgeInput;
  lock: LockChoice;
  costs: { rent: number; setup: number; fee: number; total: number; venueLabel: string };
}

export function lockBadge(f: Pick<CreateForm, 'lock' | 'lpct' | 'days'>): LpBadgeInput {
  if (f.lock === 'burn') return { status: 'BURNED', lockedPct: 100 };
  if (f.lock === 'none') return { status: 'UNLOCKED', lockedPct: 0 };
  return f.lpct >= 100 ? { status: 'LOCKED', lockedPct: 100, days: f.days } : { status: 'PARTIAL', lockedPct: f.lpct, days: f.days };
}

/** All derived create-flow state, the port of the prototype's `createState` and `refreshCreate`. */
export function useCreateModel(): CreateModel {
  const form = useCreateForm();
  const wallet = useWallet((s) => s.wallet);
  const mint = form.mint.trim();
  const valid = isAddress(mint);
  const settled = useDebounced(mint, 250);
  const tq = useToken(valid && settled === mint ? mint : '');
  const lookup: LookupState = !mint
    ? 'empty'
    : !valid
      ? 'invalid'
      : settled !== mint || tq.isPending || tq.isFetching
        ? 'loading'
        : tq.isError
          ? 'error'
          : tq.data
            ? 'ok'
            : 'missing';
  const token = lookup === 'ok' ? tq.data ?? null : null;
  const { data: quotes = [] } = useQuotes();
  const quote = quotes.find((x) => x.symbol === form.quote) ?? null;
  const bal = useBalances([token?.mint, quote?.mint]);
  const baseBal = bal.get(token?.mint);
  const quoteBal = bal.get(quote?.mint);

  const b = num(form.base);
  const qa = num(form.qamt);
  const sym = token?.symbol ?? 'TOKEN';
  const baseOver = !!token && (b > token.supply || (!!wallet && b > baseBal));
  const quoteOver = !!wallet && !!quote && qa > quoteBal;

  let msg = '';
  if (!token) msg = 'Add your token to continue.';
  else if (!quote) msg = 'Pick a stock or asset to pair with.';
  else if (!(b > 0)) msg = `Enter how much ${sym} to deposit.`;
  else if (b > token.supply) msg = `That's more ${sym} than exists. Total supply is ${compactTrim(token.supply)}.`;
  else if (wallet && b > baseBal) msg = `You have ${amt(baseBal)} ${sym}. Lower the amount.`;
  else if (!(qa > 0)) msg = `Enter how much ${quote.symbol} to deposit.`;
  else if (quoteOver) msg = `You have ${amt(quoteBal)} ${quote.symbol}. Lower the amount.`;

  const d3 = !!token && !!quote && b > 0 && qa > 0 && !baseOver && !quoteOver;
  const priceQ = startingPrice(b, qa);
  const priceU = quote ? priceQ * quote.priceUsd : 0;
  const v = venueInfo(form.venue);
  const setup = v.setupSol;

  return {
    form,
    lookup,
    token,
    quotes,
    quote,
    baseBal,
    quoteBal,
    b,
    qa,
    msg,
    done: [!!token, !!token && !!quote, d3, d3, d3],
    baseOver,
    quoteOver,
    priceQ,
    priceU,
    liq: quote ? poolLiquidityUsd(qa, quote.priceUsd) : 0,
    mcap: token ? priceU * token.supply : 0,
    lp: lockBadge(form),
    lock: form.lock === 'lock' ? { kind: 'lock', days: form.days, pct: form.lpct } : { kind: form.lock },
    costs: { rent: NETWORK_RENT_SOL, setup, fee: oxbowFeeSol, total: +(NETWORK_RENT_SOL + setup + oxbowFeeSol).toFixed(2), venueLabel: v.label },
  };
}
