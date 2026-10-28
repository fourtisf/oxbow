'use client';

import { create } from 'zustand';
import { b58, hash, rng } from '@oxbow/shared';
import { seedMockPositions } from '../chain/mock';
import { toast } from './toast';

/**
 * Mock wallet for M1, with the prototype's "Select wallet" flow. M3 replaces
 * the internals with @solana/wallet-adapter while keeping this interface, so
 * the WalletButton and modal stay as they are.
 */
export interface ConnectedWallet {
  name: string;
  address: string;
}

export const WALLETS: { name: string; bg: string }[] = [
  { name: 'Phantom', bg: 'linear-gradient(135deg,#B8A8FF,#7A5CF0)' },
  { name: 'Solflare', bg: 'linear-gradient(135deg,#FFC163,#F26B2A)' },
  { name: 'Backpack', bg: 'linear-gradient(135deg,#FF6B6B,#C9262D)' },
];

interface WalletState {
  wallet: ConnectedWallet | null;
  modal: 'select' | 'account' | null;
  connecting: string | null;
  after: (() => void) | null;
  /** Opens the picker, or the account view when already connected. `after` runs once connected. */
  open(after?: () => void): void;
  close(): void;
  connect(name: string): Promise<void>;
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
    if (get().connecting) return;
    set({ connecting: name });
    await new Promise((r) => setTimeout(r, 850));
    seedMockPositions();
    const after = get().after;
    set({
      wallet: { name, address: b58(rng(hash(name + Date.now())), 44) },
      connecting: null,
      modal: null,
      after: null,
    });
    toast('Connected ' + name);
    after?.();
  },
  disconnect: () => {
    set({ wallet: null, modal: null });
    toast('Wallet disconnected');
  },
}));
