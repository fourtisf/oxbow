'use client';

import { create } from 'zustand';
import type { Timeframe } from '@oxbow/shared';

interface UiState {
  /** Pool just created in this session; highlighted in Explore. */
  freshAddress: string | null;
  /** Pool to open in the drawer once Explore mounts (after "View pool"). */
  pendingOpen: string | null;
  /** Selected row in the home "Top markets" table (null = top mover). */
  homeSel: string | null;
  /** Timeframe of the home pool-details chart. */
  homeTf: Timeframe;
  set(patch: Partial<Omit<UiState, 'set'>>): void;
}

export const useUi = create<UiState>((set) => ({
  freshAddress: null,
  pendingOpen: null,
  homeSel: null,
  homeTf: '1D',
  set: (patch) => set(patch),
}));
