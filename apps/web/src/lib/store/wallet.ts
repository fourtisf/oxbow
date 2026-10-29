'use client';

import { create } from 'zustand';
import { b58, hash, rng } from '@oxbow/shared';
import { seedMockPositions } from '../chain/mock';

/**
 * Mock wallet for M1, with the prototype's "Select wallet" flow. M3 replaces
 * the internals with @solana/wallet-adapter while keeping this interface, so
 * the WalletButton and modal stay as they are.
 */
export interface ConnectedWallet {
  name: string;
  address: string;
}

/** Bump when the Terms or Risk disclosure change materially, to ask again. */
const TERMS_KEY = 'oxbow_terms_v1';

export function termsAccepted(): boolean {
  try {
    return localStorage.getItem(TERMS_KEY) === '1';
  } catch {
    return false;
  }
}

export function acceptTerms() {
  try {
    localStorage.setItem(TERMS_KEY, '1');
  } catch {
    // Blocked storage: the visitor is asked again next visit.
  }
}

interface WalletState {
  wallet: ConnectedWallet | null;
  modal: 'select' | 'account' | null;
  connecting: string | null;
  after: (() => void) | null;
  /** Opens the picker, or the account view when already connected. `after` runs once connected. */
  open(after?: () => void): void;
  close(): void;
  /** Resolves with the connected wallet, or null if a connection is already in progress. */
  connect(name: string): Promise<ConnectedWallet | null>;
  disconnect(): void;
}

export const useWallet = create<WalletState>((set, get) => ({
  wallet: null,
  modal: null,
  connecting: null,
  after: null,
  open: (after) => set({ modal: get().wallet ? 'account' : 'select', after: after ?? null }),
  close: () => {
    if (get().connecting) return;
    set({ modal: null, after: null });
  },
  connect: async (name) => {
    if (get().connecting) return null;
    set({ connecting: name });
    await new Promise((r) => setTimeout(r, 850));
    seedMockPositions();
    const after = get().after;
    const wallet = { name, address: b58(rng(hash(name + Date.now())), 44) };
    set({ wallet, connecting: null, modal: null, after: null });
    after?.();
    return wallet;
  },
  disconnect: () => set({ wallet: null, modal: null }),
}));
