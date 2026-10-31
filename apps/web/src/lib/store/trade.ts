'use client';

import { create } from 'zustand';
import { SLIPPAGE_AUTO, type TokenBrief, type TradeSide } from '@oxbow/shared';

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
  /** Basis points, or SLIPPAGE_AUTO (0): picked per trade by the server. */
  slippageBps: number;
  open(t: TradeTarget): void;
  close(): void;
  setSlippage(bps: number): void;
}

/** The buy/sell panel: which token it is open for. */
export const useTrade = create<TradeState>((set) => ({
  target: null,
  slippageBps: SLIPPAGE_AUTO,
  open: (target) => set({ target }),
  close: () => set({ target: null }),
  setSlippage: (slippageBps) => set({ slippageBps }),
}));
