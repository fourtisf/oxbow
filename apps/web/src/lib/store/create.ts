'use client';

import { create } from 'zustand';
import type { VenueId } from '@oxbow/shared';

export type LockKind = 'burn' | 'lock' | 'none';

export interface CreateForm {
  /** Raw text in the step 1 mint field. */
  mint: string;
  /** Quote asset symbol (TSLAx, SOL, USDC...). */
  quote: string | null;
  /** Deposit inputs as typed, may contain commas. */
  base: string;
  qamt: string;
  venue: VenueId;
  feeBps: number;
  lock: LockKind;
  days: number;
  lpct: number;
  /** Creator confirmed the token's risk warnings (step 1). Reset when the mint changes. */
  ack: boolean;
}

const initial: CreateForm = {
  mint: '',
  quote: null,
  base: '',
  qamt: '',
  venue: 'RAYDIUM_CPMM',
  feeBps: 100,
  lock: 'burn',
  days: 180,
  lpct: 100,
  ack: false,
};

interface CreateState extends CreateForm {
  set(patch: Partial<CreateForm>): void;
  /** Changing the pair asset clears its deposit, as in the prototype. */
  setQuote(sym: string): void;
  reset(): void;
}

/**
 * Create-flow form. Lives outside the page so the home "Create a stock-paired
 * pool" card and the create page share the chosen stock.
 */
export const useCreateForm = create<CreateState>((set) => ({
  ...initial,
  set: (patch) => set(patch.mint !== undefined ? { ...patch, ack: false } : patch),
  setQuote: (sym) => set({ quote: sym, qamt: '' }),
  reset: () => set(initial),
}));
