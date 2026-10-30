'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import { amt, shortAddr, usd, type FeedTrade } from '@oxbow/shared';
import { currentT } from '@/i18n/client';
import { api } from './api';
import { walletHref } from './links';
import { show } from './notify';
import { useFollow } from './store/follow';

const KEEP = 300;

interface LiveState {
  /** Trades that arrived over the stream this visit, newest first. */
  trades: FeedTrade[];
  push(t: FeedTrade): void;
}

export const useLive = create<LiveState>((set, get) => ({
  trades: [],
  push: (t) => {
    if (get().trades.some((x) => x.id === t.id)) return;
    set({ trades: [t, ...get().trades].slice(0, KEEP) });
  },
}));

function alert(t: FeedTrade) {
  const f = useFollow.getState();
  if (!f.list.some((x) => x.address === t.wallet && x.alerts)) return;
  const tr = currentT();
  const who = f.names[t.wallet] || t.walletLabel || shortAddr(t.wallet);
  show(tr.notify.title(who, t.side, t.token.symbol), tr.notify.body(amt(t.amount), `${amt(t.quoteAmount)} ${t.quoteSymbol}`, usd(t.usd)), walletHref(t.wallet), t.id);
}

/** One stream per tab, opened by the root providers. */
export function useLiveStream() {
  useEffect(
    () =>
      api.subscribe((t) => {
        useLive.getState().push(t);
        alert(t);
      }),
    [],
  );
}

/** Live trades on top of a fetched list, without duplicates, newest first. */
export function mergeLive(live: FeedTrade[], fetched: FeedTrade[], keep: (t: FeedTrade) => boolean): FeedTrade[] {
  const ids = new Set(fetched.map((t) => t.id));
  const newest = fetched[0]?.ts ?? '';
  const fresh = live.filter((t) => !ids.has(t.id) && t.ts >= newest && keep(t));
  return [...fresh, ...fetched];
}
