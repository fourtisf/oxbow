'use client';

import { create } from 'zustand';
import { isAddress } from '@oxbow/shared';

/**
 * Wallets the visitor follows and the nicknames they gave wallets. Kept in
 * this browser only (no account system); storage can be blocked, so every
 * access is guarded and the lists simply start empty. Loaded after hydration
 * so SSR and the first client render match.
 */
const KEY = 'oxbow_follow_v1';
const MAX = 100;

export interface Followed {
  address: string;
  alerts: boolean;
  at: number;
}

interface Saved {
  list: Followed[];
  names: Record<string, string>;
}

function read(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Saved>;
    const list = Array.isArray(v.list)
      ? v.list.filter((f): f is Followed => !!f && typeof f.address === 'string' && isAddress(f.address)).map((f) => ({ address: f.address, alerts: !!f.alerts, at: Number(f.at) || 0 }))
      : [];
    const names: Record<string, string> = {};
    for (const [k, n] of Object.entries(v.names ?? {})) if (isAddress(k) && typeof n === 'string') names[k] = n.slice(0, 32);
    return { list: list.slice(0, MAX), names };
  } catch {
    return { list: [], names: {} };
  }
}

function write(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Blocked storage: keep the in-memory lists for this visit.
  }
}

interface FollowState extends Saved {
  loaded: boolean;
  load(): void;
  isFollowing(address: string): boolean;
  follow(address: string): void;
  unfollow(address: string): void;
  setAlerts(address: string, on: boolean): void;
  rename(address: string, name: string): void;
}

export const useFollow = create<FollowState>((set, get) => {
  const save = (patch: Partial<Saved>) => {
    set(patch);
    write({ list: get().list, names: get().names });
  };
  return {
    list: [],
    names: {},
    loaded: false,
    load: () => set({ ...read(), loaded: true }),
    isFollowing: (a) => get().list.some((f) => f.address === a),
    follow: (a) => {
      if (get().isFollowing(a)) return;
      save({ list: [{ address: a, alerts: false, at: Date.now() }, ...get().list].slice(0, MAX) });
    },
    unfollow: (a) => save({ list: get().list.filter((f) => f.address !== a) }),
    setAlerts: (a, on) => save({ list: get().list.map((f) => (f.address === a ? { ...f, alerts: on } : f)) }),
    rename: (a, name) => {
      const names = { ...get().names };
      const n = name.trim().slice(0, 32);
      if (n) names[a] = n;
      else delete names[a];
      save({ names });
    },
  };
});

/** What to call a wallet: the viewer's nickname, the featured label, or nothing (callers show the short address). */
export function useWalletName(address: string, label?: string | null): string | null {
  const nick = useFollow((s) => s.names[address]);
  return nick || label || null;
}
