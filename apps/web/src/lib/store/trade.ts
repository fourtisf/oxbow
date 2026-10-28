'use client';

import { create } from 'zustand';

/** Swap settings shared by every pool for this visit. */
export const SLIPPAGE_PRESETS_BPS = [50, 100, 200] as const;
/** Above this the UI warns that the price could be much worse. */
export const HIGH_SLIPPAGE_BPS = 500;
export const MAX_SLIPPAGE_BPS = 5000;

interface TradeSettings {
  slippageBps: number;
  set(bps: number): void;
}

export const useTradeSettings = create<TradeSettings>((set) => ({
  slippageBps: 100,
  set: (bps) => set({ slippageBps: Math.min(MAX_SLIPPAGE_BPS, Math.max(1, Math.round(bps))) }),
}));
