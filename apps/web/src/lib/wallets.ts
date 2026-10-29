'use client';

import { useEffect, useState } from 'react';

/**
 * Solana wallets offered in "Select wallet", with their official icons
 * (public/wallets: each wallet's own adapter icon, copied by
 * scripts/wallet-logos.py) and a check for whether this browser has the wallet:
 * the provider object it injects, or its Wallet Standard registration.
 * Connecting is simulated until M3 wires in the wallet adapter.
 */
export interface WalletInfo {
  name: string;
  icon: string;
  /** The wallet's own site, for "Install". */
  url: string;
  /** Tile behind icons that are only a glyph on transparent. */
  tile?: string;
  /** Connects over USB; nothing to detect in the page. */
  hardware?: boolean;
  /** True when the wallet's injected provider is on `window`. */
  injected?: (w: Injected) => boolean;
}

/** `window` with whatever wallet extensions inject: untyped by nature. */
type Injected = Window & Record<string, any>;

export const WALLETS: WalletInfo[] = [
  { name: 'Phantom', icon: '/wallets/phantom.svg', url: 'https://phantom.app', injected: (w) => !!w.phantom?.solana?.isPhantom },
  { name: 'Solflare', icon: '/wallets/solflare.svg', url: 'https://solflare.com', injected: (w) => !!w.solflare?.isSolflare },
  { name: 'Backpack', icon: '/wallets/backpack.png', url: 'https://backpack.app', tile: '#14151B', injected: (w) => !!w.backpack?.isBackpack },
  { name: 'Bitget Wallet', icon: '/wallets/bitget.svg', url: 'https://web3.bitget.com', injected: (w) => !!w.bitkeep?.solana },
  { name: 'OKX Wallet', icon: '/wallets/okx.svg', url: 'https://www.okx.com/web3', injected: (w) => !!w.okxwallet?.solana },
  { name: 'Coinbase Wallet', icon: '/wallets/coinbase.svg', url: 'https://www.coinbase.com/wallet', injected: (w) => !!w.coinbaseSolana },
  { name: 'Trust Wallet', icon: '/wallets/trust.svg', url: 'https://trustwallet.com', injected: (w) => !!w.trustwallet?.solana },
  { name: 'Magic Eden', icon: '/wallets/magiceden.svg', url: 'https://wallet.magiceden.io', tile: '#1C1022', injected: (w) => !!w.magicEden?.solana },
  { name: 'Exodus', icon: '/wallets/exodus.svg', url: 'https://www.exodus.com', tile: '#0D1030', injected: (w) => !!w.exodus?.solana },
  { name: 'Nightly', icon: '/wallets/nightly.svg', url: 'https://nightly.app', injected: (w) => !!w.nightly?.solana },
  { name: 'Coin98', icon: '/wallets/coin98.svg', url: 'https://coin98.com', injected: (w) => !!w.coin98?.sol },
  { name: 'TokenPocket', icon: '/wallets/tokenpocket.svg', url: 'https://tokenpocket.pro', injected: (w) => !!w.solana?.isTokenPocket },
  { name: 'Ledger', icon: '/wallets/ledger.svg', url: 'https://www.ledger.com', tile: '#000', hardware: true },
];

/** "Trust" registers for "Trust Wallet", "Bitget Wallet" for itself: compare first words. */
const sameWallet = (ours: string, registered: string) => registered.toLowerCase().split(/\s+/)[0] === ours.toLowerCase().split(/\s+/)[0];

/** Names of the wallets installed in this browser. Empty during SSR and until the first check. */
export function useInstalledWallets(): Set<string> {
  const [found, setFound] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const registered = new Set<string>();
    const update = () =>
      setFound(new Set(WALLETS.filter((w) => w.injected?.(window) || [...registered].some((r) => sameWallet(w.name, r))).map((w) => w.name)));
    // Wallet Standard: wallets announce themselves on "register-wallet", or answer our "app-ready".
    const api = {
      register: (...wallets: { name: string }[]) => {
        wallets.forEach((w) => registered.add(w.name));
        update();
        return () => {};
      },
    };
    const onRegister = (e: Event) => (e as CustomEvent<(a: typeof api) => void>).detail?.(api);
    window.addEventListener('wallet-standard:register-wallet', onRegister);
    window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: api }));
    update();
    // Some extensions inject a moment after the page loads.
    const late = setTimeout(update, 800);
    return () => {
      window.removeEventListener('wallet-standard:register-wallet', onRegister);
      clearTimeout(late);
    };
  }, []);
  return found;
}
