'use client';

import { create } from 'zustand';

/**
 * Pools the visitor follows. Kept in this browser only (no account system);
 * storage can be blocked, so every access is guarded and the list simply
 * starts empty. Loaded after hydration so SSR and the first client render match.
 */
const KEY = 'oxbow_watchlist';
const MAX = 100;

function read(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, MAX) : [];
  } catch {
    return [];
  }
}

function write(list: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Blocked storage: keep the in-memory list for this visit.
  }
}

interface WatchState {
  list: string[];
  load(): void;
  toggle(address: string): boolean;
}

export const useWatchlist = create<WatchState>((set, get) => ({
  list: [],
  load: () => set({ list: read() }),
  toggle: (a) => {
    const has = get().list.includes(a);
    const list = has ? get().list.filter((x) => x !== a) : [a, ...get().list].slice(0, MAX);
    set({ list });
    write(list);
    return !has;
  },
}));
