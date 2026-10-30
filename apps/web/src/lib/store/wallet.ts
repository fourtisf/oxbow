'use client';

import { create } from 'zustand';
import { connectWallet, disconnectWallet, waitForWallet, watchWallet } from '../wallets';

/**
 * The connected wallet, with the "Select wallet" flow. Connecting asks the
 * wallet for its public address; trades are signed through the Wallet
 * Standard (see wallets.ts).
 */
export interface ConnectedWallet {
  name: string;
  address: string;
}

/** Bump when the Terms or Risk disclosure change materially, to ask again. */
const TERMS_KEY = 'oxbow_terms_v1';
/** Last connected wallet, to reconnect silently on the next visit. */
const LAST_KEY = 'oxbow_wallet';

function remember(name: string | null) {
  try {
    if (name) localStorage.setItem(LAST_KEY, name);
    else localStorage.removeItem(LAST_KEY);
  } catch {
    // Blocked storage: no silent reconnect.
  }
}

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
  /** Resolves with the connected wallet, or null if a connection is already in progress. Throws WalletError. */
  connect(name: string): Promise<ConnectedWallet | null>;
  disconnect(): void;
  /** Reconnects the last wallet without a prompt, if the site is still approved in it. */
  restore(): Promise<void>;
}

let unwatch: () => void = () => {};

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
    let address: string;
    try {
      address = await connectWallet(name);
    } catch (e) {
      set({ connecting: null });
      throw e;
    }
    const after = get().after;
    const wallet = { name, address };
    set({ wallet, connecting: null, modal: null, after: null });
    follow(name);
    after?.();
    return wallet;
  },
  disconnect: () => {
    const w = get().wallet;
    set({ wallet: null, modal: null });
    if (w) {
      unwatch();
      remember(null);
      void disconnectWallet(w.name);
    }
  },
  restore: async () => {
    if (get().wallet || get().connecting || !termsAccepted()) return;
    let name: string | null = null;
    try {
      name = localStorage.getItem(LAST_KEY);
    } catch {
      return;
    }
    if (!name || !(await waitForWallet(name))) return;
    try {
      const address = await connectWallet(name, true);
      if (get().wallet) return;
      set({ wallet: { name, address } });
      follow(name);
    } catch {
      remember(null);
    }
  },
}));

/** Keeps the address in step with account switches in the wallet, and remembers it for next time. */
function follow(name: string) {
  remember(name);
  unwatch();
  unwatch = watchWallet(name, (address) => {
    const s = useWallet.getState();
    if (s.wallet?.name !== name) return;
    if (address) useWallet.setState({ wallet: { name, address } });
    else s.disconnect();
  });
}
