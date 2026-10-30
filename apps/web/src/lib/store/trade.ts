'use client';

import { create } from 'zustand';
import type { TokenBrief, TradeSide } from '@oxbow/shared';

export interface TradeTarget {
  token: TokenBrief;
  side: TradeSide;
  /** The tracked wallet whose trade is being copied, for the panel's header. */
  from?: { address: string; name: string | null };
  /** Shown before trading a token that failed the safety check. */
  danger?: boolean;
}

interface TradeState {
  target: TradeTarget | null;
  slippageBps: number;
  open(t: TradeTarget): void;
  close(): void;
  setSlippage(bps: number): void;
}

/** The buy/sell panel: which token it is open for. */
export const useTrade = create<TradeState>((set) => ({
  target: null,
  slippageBps: 100,
  open: (target) => set({ target }),
  close: () => set({ target: null }),
  setSlippage: (slippageBps) => set({ slippageBps }),
}));
