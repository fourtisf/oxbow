'use client';

import { useDeferredValue, useEffect } from 'react';
import { create } from 'zustand';
import { ageHours, fmtAge, isAddress, pct, usd, venueInfo, type PoolSort, type PoolSummary, type QuoteFilter } from '@oxbow/shared';
import { useT } from '@/i18n/client';
import { track } from '@/lib/analytics';
import { DEFAULT_EXPLORE, exploreQuery, type ExploreFilterValues } from '@/lib/api/presets';
import { usePoolsInfinite } from '@/lib/api/queries';
import { useHydrated } from '@/lib/hooks';
import { useOpenPool } from '@/lib/nav';
import { useUi } from '@/lib/store/ui';
import { useWatchlist } from '@/lib/store/watchlist';
import { ChangePill, LpBadge, SafetyMark } from '../ui/badges';
import { SearchSmIcon, StarIcon } from '../ui/Icons';
import { Sparkline } from '../ui/Sparkline';
import { PairAvatar } from '../ui/TokenAvatar';
import { Button, Fmt } from '../ui/primitives';

interface ExploreFilters extends ExploreFilterValues {
  watch: boolean;
  set(p: Partial<ExploreFilterValues & { watch: boolean }>): void;
}

/** Filters survive navigating away and back, like the prototype's in-memory state. */
export const useExploreFilters = create<ExploreFilters>((set) => ({
  ...DEFAULT_EXPLORE,
  watch: false,
  set: (p) => set(p),
}));

const QUOTES: QuoteFilter[] = ['all', 'stock', 'SOL', 'USDC'];
const SORTS: PoolSort[] = ['vol', 'tvl', 'chg', 'apr', 'new'];

/** Star toggle for the watchlist. Renders unfilled until hydrated (the list lives in this browser). */
export function WatchStar({ address, pair, className = 'star' }: { address: string; pair: string; className?: string }) {
  const t = useT();
  const hydrated = useHydrated();
  const on = useWatchlist((s) => s.list.includes(address)) && hydrated;
  const toggle = useWatchlist((s) => s.toggle);
  return (
    <button
      className={className}
      aria-pressed={on}
      aria-label={on ? t.explore.watchRemove(pair) : t.explore.watchAdd(pair)}
      onClick={(e) => {
        e.stopPropagation();
        if (toggle(address)) track('watchlist_add');
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <StarIcon filled={on} />
    </button>
  );
}

function Row({ p, i, maxT, fresh, onOpen }: { p: PoolSummary; i: number; maxT: number; fresh: boolean; onOpen: () => void }) {
  const t = useT();
  const pair = `${p.base.symbol}/${p.quote.symbol}`;
  return (
    <tr
      tabIndex={0}
      className={fresh ? 'fresh' : undefined}
      aria-label={t.explore.open(pair)}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <td className="rank">{String(i + 1).padStart(2, '0')}</td>
      <td data-l={t.home.th.pair}>
        <div className="pair">
          <PairAvatar base={p.base} quote={p.quote} size={32} />
          <div>
            <b>
              {pair}
              <SafetyMark safety={p.safety} />
            </b>
            <small>{t.home.onVenue(p.base.name, venueInfo(p.venue).label)}</small>
          </div>
          <WatchStar address={p.address} pair={pair} />
        </div>
      </td>
      <td data-l={t.home.th.price}>
        <Fmt>{usd(p.priceUsd)}</Fmt>
      </td>
      <td data-l={t.home.th.ch24}>{p.vol24hUsd ? <ChangePill value={p.change24h} /> : <span className="muted">{t.common.new}</span>}</td>
      <td className="hide-xl mini">{p.vol24hUsd ? <Sparkline data={p.spark7d} W={96} H={30} area={false} sw={1.6} w={96} h={30} /> : null}</td>
      <td data-l={t.home.th.vol}>
        <Fmt>{usd(p.vol24hUsd)}</Fmt>
      </td>
      <td data-l={t.home.th.liq}>
        <span className="liqcell">
          <Fmt>{usd(p.tvlUsd)}</Fmt>
          <i style={{ width: Math.max(10, (p.tvlUsd / maxT) * 72) }} />
        </span>
      </td>
      <td data-l={t.home.th.apr} className="hide-xl up">
        {p.vol24hUsd ? pct(p.feeAprPct) : '—'}
      </td>
      <td data-l={t.home.th.status} className="st">
        <LpBadge lp={p.lp} />
      </td>
      <td data-l={t.home.th.age} className="hide-xl" suppressHydrationWarning>
        {fmtAge(ageHours(p.createdAt))}
      </td>
    </tr>
  );
}

export function ExploreView() {
  const t = useT();
  const f = useExploreFilters();
  const watchlist = useWatchlist((s) => s.list);
  const q = useDeferredValue(f.q);
  const { freshAddress: fresh, pendingOpen, set: setUi } = useUi();
  const openPool = useOpenPool();
  // "View pool" from the create success dialog lands here, then opens the new pool.
  useEffect(() => {
    if (!pendingOpen) return;
    setUi({ pendingOpen: null });
    openPool(pendingOpen);
  }, [pendingOpen, setUi, openPool]);

  const watchEmpty = f.watch && !watchlist.length;
  const query = { ...exploreQuery({ ...f, q }), ...(f.watch ? { addresses: watchlist.join(',') } : {}) };
  const pools = usePoolsInfinite(query);
  const list = watchEmpty ? [] : pools.data?.pages.flatMap((pg) => pg.items) ?? [];
  const total = watchEmpty ? 0 : pools.data?.pages[0]?.total ?? 0;
  const maxT = Math.max(1, ...list.map((p) => p.tvlUsd));
  const emptyMsg = watchEmpty ? t.explore.emptyWatch : isAddress(q.trim()) ? t.explore.emptyAddress : t.explore.empty;

  return (
    <div className="card">
      <div className="toolbar">
        <label className="search">
          <SearchSmIcon />
          <input type="search" placeholder={t.explore.search} aria-label={t.explore.searchAria} autoComplete="off" spellCheck={false} value={f.q} onChange={(e) => f.set({ q: e.target.value })} />
        </label>
        <div className="seg" role="group" aria-label={t.explore.pairedWith}>
          {QUOTES.map((v) => (
            <button key={v} aria-pressed={f.quote === v} onClick={() => f.set({ quote: v })}>
              {t.explore.quote[v]}
            </button>
          ))}
        </div>
        <button className="switch" role="switch" aria-checked={f.locked} onClick={() => f.set({ locked: !f.locked })}>
          <span className="knob" aria-hidden="true" />
          {t.explore.lockedOnly}
        </button>
        <button className="wtoggle" aria-pressed={f.watch} onClick={() => f.set({ watch: !f.watch })}>
          <StarIcon filled={f.watch} />
          {t.explore.watchlist}
        </button>
        <select className="select" aria-label={t.explore.sortAria} value={f.sort} onChange={(e) => f.set({ sort: e.target.value as PoolSort })}>
          {SORTS.map((v) => (
            <option key={v} value={v}>
              {t.explore.sort[v]}
            </option>
          ))}
        </select>
        <span className="count" aria-live="polite">
          {pools.data || watchEmpty ? t.common.markets(total) : ''}
        </span>
      </div>
      <div className="tscroll">
        <table className="mk ex">
          <thead>
            <tr>
              <th className="rank">{t.home.th.rank}</th>
              <th>{t.home.th.pair}</th>
              <th>{t.home.th.price}</th>
              <th>{t.home.th.ch24}</th>
              <th className="hide-xl">{t.home.th.ch7}</th>
              <th>{t.home.th.vol}</th>
              <th>{t.home.th.liq}</th>
              <th className="hide-xl">{t.home.th.apr}</th>
              <th>{t.home.th.status}</th>
              <th className="hide-xl">{t.home.th.age}</th>
            </tr>
          </thead>
          <tbody>
            {pools.isError && !watchEmpty ? (
              <tr className="empty-row">
                <td colSpan={10}>
                  {t.explore.loadError}{' '}
                  <button className="link" style={{ marginTop: 0 }} onClick={() => pools.refetch()}>
                    {t.common.tryAgain}
                  </button>
                </td>
              </tr>
            ) : (pools.data || watchEmpty) && !list.length ? (
              <tr className="empty-row">
                <td colSpan={10}>{emptyMsg}</td>
              </tr>
            ) : (
              list.map((p, i) => <Row key={p.address} p={p} i={i} maxT={maxT} fresh={p.address === fresh} onOpen={() => openPool(p.address)} />)
            )}
          </tbody>
        </table>
      </div>
      {pools.hasNextPage && !watchEmpty && (
        <div className="more">
          <Button variant="glass" size="sm" onClick={() => pools.fetchNextPage()} disabled={pools.isFetchingNextPage}>
            {pools.isFetchingNextPage ? <span className="spin" aria-label={t.common.loading} /> : t.explore.loadMore}
          </Button>
        </div>
      )}
    </div>
  );
}
