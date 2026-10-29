'use client';

import { useEffect, useState } from 'react';
import { isAddress } from '@oxbow/shared';

/**
 * Solana wallets offered in "Select wallet", with their official icons
 * (public/wallets: each wallet's own adapter icon, copied by
 * scripts/wallet-logos.py), a check for whether this browser has the wallet
 * (its Wallet Standard registration or the provider it injects), and a
 * read-only connection that asks the wallet for its public address. Nothing
 * here signs; transactions arrive with the wallet adapter in M3.
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
  /** The provider the wallet injects on `window`, if it is there. */
  provider?: (w: Injected) => LegacyProvider | null | undefined;
}

/** `window` with whatever wallet extensions inject: untyped by nature. */
type Injected = Window & Record<string, any>;

/** The pre-Wallet-Standard provider API (`window.phantom.solana` and friends). */
interface LegacyProvider {
  publicKey?: { toString(): string } | null;
  connect?: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey?: { toString(): string } } | boolean | void>;
  disconnect?: () => Promise<void>;
}

const pick = (p: any, ok: boolean): LegacyProvider | null => (ok ? (p as LegacyProvider) : null);

export const WALLETS: WalletInfo[] = [
  { name: 'Phantom', icon: '/wallets/phantom.svg', url: 'https://phantom.app', provider: (w) => pick(w.phantom?.solana, !!w.phantom?.solana?.isPhantom) },
  { name: 'Solflare', icon: '/wallets/solflare.svg', url: 'https://solflare.com', provider: (w) => pick(w.solflare, !!w.solflare?.isSolflare) },
  { name: 'Backpack', icon: '/wallets/backpack.png', url: 'https://backpack.app', tile: '#14151B', provider: (w) => pick(w.backpack, !!w.backpack?.isBackpack) },
  { name: 'Bitget Wallet', icon: '/wallets/bitget.svg', url: 'https://web3.bitget.com', provider: (w) => w.bitkeep?.solana },
  { name: 'OKX Wallet', icon: '/wallets/okx.svg', url: 'https://www.okx.com/web3', provider: (w) => w.okxwallet?.solana },
  { name: 'Coinbase Wallet', icon: '/wallets/coinbase.svg', url: 'https://www.coinbase.com/wallet', provider: (w) => w.coinbaseSolana },
  { name: 'Trust Wallet', icon: '/wallets/trust.svg', url: 'https://trustwallet.com', provider: (w) => w.trustwallet?.solana },
  { name: 'Magic Eden', icon: '/wallets/magiceden.svg', url: 'https://wallet.magiceden.io', tile: '#1C1022', provider: (w) => w.magicEden?.solana },
  { name: 'Exodus', icon: '/wallets/exodus.svg', url: 'https://www.exodus.com', tile: '#0D1030', provider: (w) => w.exodus?.solana },
  { name: 'Nightly', icon: '/wallets/nightly.svg', url: 'https://nightly.app', provider: (w) => w.nightly?.solana },
  { name: 'Coin98', icon: '/wallets/coin98.svg', url: 'https://coin98.com', provider: (w) => w.coin98?.sol },
  { name: 'TokenPocket', icon: '/wallets/tokenpocket.svg', url: 'https://tokenpocket.pro', provider: (w) => pick(w.solana, !!w.solana?.isTokenPocket) },
  { name: 'Ledger', icon: '/wallets/ledger.svg', url: 'https://www.ledger.com', tile: '#000', hardware: true },
];

/** "Trust" registers for "Trust Wallet", "Bitget Wallet" for itself: compare first words. */
const sameWallet = (ours: string, registered: string) => registered.toLowerCase().split(/\s+/)[0] === ours.toLowerCase().split(/\s+/)[0];

// ---------------------------------------------------------------- Wallet Standard

interface StdAccount {
  address: string;
  chains?: readonly string[];
}
interface StdWallet {
  name: string;
  chains?: readonly string[];
  accounts?: readonly StdAccount[];
  features?: Record<string, any>;
}

const registry = new Set<StdWallet>();
const listeners = new Set<() => void>();
let started = false;

/** Collects Wallet Standard wallets: they announce themselves on "register-wallet", or answer our "app-ready". */
function startRegistry() {
  if (started || typeof window === 'undefined') return;
  started = true;
  const api = {
    register: (...wallets: StdWallet[]) => {
      wallets.forEach((w) => registry.add(w));
      listeners.forEach((l) => l());
      return () => {
        wallets.forEach((w) => registry.delete(w));
        listeners.forEach((l) => l());
      };
    },
  };
  window.addEventListener('wallet-standard:register-wallet', (e) => (e as CustomEvent<(a: typeof api) => void>).detail?.(api));
  window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: api }));
}

const isSolana = (w: StdWallet) => !w.chains?.length || w.chains.some((c) => c.startsWith('solana:'));
const registeredFor = (name: string) => [...registry].find((w) => sameWallet(name, w.name) && isSolana(w));
const standardFor = (name: string) => [...registry].find((w) => sameWallet(name, w.name) && isSolana(w) && w.features?.['standard:connect']);
const infoFor = (name: string) => WALLETS.find((w) => w.name === name);

/** Names of the wallets installed in this browser. Empty during SSR and until the first check. */
export function useInstalledWallets(): Set<string> {
  const [found, setFound] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    startRegistry();
    const update = () => setFound(new Set(WALLETS.filter((w) => !!w.provider?.(window) || !!registeredFor(w.name)).map((w) => w.name)));
    listeners.add(update);
    update();
    // Some extensions inject a moment after the page loads.
    const late = setTimeout(update, 800);
    return () => {
      listeners.delete(update);
      clearTimeout(late);
    };
  }, []);
  return found;
}

// ---------------------------------------------------------------- connecting

export type WalletErrorCode = 'NOT_INSTALLED' | 'REJECTED' | 'HARDWARE' | 'FAILED';
export class WalletError extends Error {
  constructor(readonly code: WalletErrorCode) {
    super(code);
  }
}

/** Wallets answer a refused prompt with EIP-1193 code 4001 or a "rejected" message. */
const rejected = (e: unknown) => {
  const x = e as { code?: number; name?: string; message?: string } | null;
  return x?.code === 4001 || /reject|denied|cancel/i.test(`${x?.name ?? ''} ${x?.message ?? ''}`);
};

const solanaAccount = (accounts: readonly StdAccount[] | undefined) =>
  (accounts ?? []).find((a) => isAddress(a.address) && (!a.chains?.length || a.chains.some((c) => c.startsWith('solana:'))));

/**
 * Asks the wallet for its public address. `silent` only succeeds when the
 * site is already approved, without a prompt (used to restore a session).
 */
export async function connectWallet(name: string, silent = false): Promise<string> {
  const info = infoFor(name);
  if (info?.hardware) throw new WalletError('HARDWARE');
  startRegistry();
  try {
    const std = standardFor(name);
    if (std) {
      const res = (await std.features!['standard:connect'].connect(silent ? { silent: true } : undefined)) as { accounts?: StdAccount[] } | undefined;
      const acct = solanaAccount(res?.accounts) ?? solanaAccount(std.accounts);
      if (!acct) throw new WalletError(silent ? 'FAILED' : 'REJECTED');
      return acct.address;
    }
    const p = info?.provider?.(window);
    if (p?.connect) {
      const res = await p.connect(silent ? { onlyIfTrusted: true } : undefined);
      const key = (typeof res === 'object' && res?.publicKey) || p.publicKey;
      const address = key?.toString() ?? '';
      if (!isAddress(address)) throw new WalletError('FAILED');
      return address;
    }
  } catch (e) {
    if (e instanceof WalletError) throw e;
    throw new WalletError(rejected(e) ? 'REJECTED' : 'FAILED');
  }
  throw new WalletError('NOT_INSTALLED');
}

export async function disconnectWallet(name: string): Promise<void> {
  try {
    const std = standardFor(name);
    if (std?.features?.['standard:disconnect']) await std.features['standard:disconnect'].disconnect();
    else await infoFor(name)?.provider?.(window)?.disconnect?.();
  } catch {
    // Already disconnected on the wallet's side.
  }
}

/** Follows account switches in the wallet. Calls `onChange(null)` when the wallet drops the site. */
export function watchWallet(name: string, onChange: (address: string | null) => void): () => void {
  const events = standardFor(name)?.features?.['standard:events'];
  if (!events?.on) return () => {};
  return events.on('change', (props: { accounts?: StdAccount[] }) => {
    if (!props.accounts) return;
    onChange(solanaAccount(props.accounts)?.address ?? null);
  });
}

/** Waits up to `ms` for a wallet to register or inject (extensions load after the page). */
export async function waitForWallet(name: string, ms = 1500): Promise<boolean> {
  startRegistry();
  const found = () => !!standardFor(name) || !!infoFor(name)?.provider?.(window);
  for (let t = 0; t < ms && !found(); t += 100) await new Promise((r) => setTimeout(r, 100));
  return found();
}
