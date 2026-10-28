'use client';

import { useDeferredValue, useEffect } from 'react';
import { create } from 'zustand';
import {
  ageHours,
  fmtAge,
  pct,
  usd,
  venueInfo,
  type PoolSort,
  type PoolSummary,
  type QuoteFilter,
} from '@oxbow/shared';
import { usePoolsInfinite } from '@/lib/api/queries';
import { DEFAULT_EXPLORE, exploreQuery, type ExploreFilterValues } from '@/lib/api/presets';
import { useOpenPool } from '@/lib/nav';
import { useUi } from '@/lib/store/ui';
import { SearchSmIcon } from '../ui/Icons';
import { Sparkline } from '../ui/Sparkline';
import { PairAvatar } from '../ui/TokenAvatar';
import { Button, ChangePill, Fmt, LpBadge } from '../ui/primitives';

interface ExploreFilters extends ExploreFilterValues {
  set(p: Partial<ExploreFilterValues>): void;
}

/** Filters survive navigating away and back, like the prototype's in-memory state. */
export const useExploreFilters = create<ExploreFilters>((set) => ({
  ...DEFAULT_EXPLORE,
  set: (p) => set(p),
}));

const QUOTES: [QuoteFilter, string][] = [
  ['all', 'ALL'],
  ['stock', 'STOCKS'],
  ['SOL', 'SOL'],
  ['USDC', 'USDC'],
];

const SORTS: [PoolSort, string][] = [
  ['vol', 'Most traded'],
  ['tvl', 'Most liquidity'],
  ['chg', 'Biggest movers'],
  ['apr', 'Highest fee APR'],
  ['new', 'Newest'],
];

function Row({ p, i, maxT, fresh, onOpen }: { p: PoolSummary; i: number; maxT: number; fresh: boolean; onOpen: () => void }) {
  return (
    <tr
      tabIndex={0}
      className={fresh ? 'fresh' : undefined}
      aria-label={`Open ${p.base.symbol}/${p.quote.symbol}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <td className="rank">{String(i + 1).padStart(2, '0')}</td>
      <td data-l="Pair">
        <div className="pair">
          <PairAvatar base={p.base} quote={p.quote} size={32} />
          <div>
            <b>
              {p.base.symbol}/{p.quote.symbol}
            </b>
            <small>
              {p.base.name} on {venueInfo(p.venue).label}
            </small>
          </div>
        </div>
      </td>
      <td data-l="Price">
        <Fmt>{usd(p.priceUsd)}</Fmt>
      </td>
      <td data-l="24h">{p.vol24hUsd ? <ChangePill value={p.change24h} /> : <span className="muted">New</span>}</td>
      <td className="hide-xl mini">{p.vol24hUsd ? <Sparkline data={p.spark7d} W={96} H={30} area={false} sw={1.6} w={96} h={30} /> : null}</td>
      <td data-l="Volume">
        <Fmt>{usd(p.vol24hUsd)}</Fmt>
      </td>
      <td data-l="Liquidity">
        <span className="liqcell">
          <Fmt>{usd(p.tvlUsd)}</Fmt>
          <i style={{ width: Math.max(10, (p.tvlUsd / maxT) * 72) }} />
        </span>
      </td>
      <td data-l="Fee APR" className="hide-xl up">
        {p.vol24hUsd ? pct(p.feeAprPct) : '—'}
      </td>
      <td data-l="Status" className="st">
        <LpBadge lp={p.lp} />
      </td>
      <td data-l="Age" className="hide-xl" suppressHydrationWarning>
        {fmtAge(ageHours(p.createdAt))}
      </td>
    </tr>
  );
}

export function ExploreView() {
  const f = useExploreFilters();
  const q = useDeferredValue(f.q);
  const { freshAddress: fresh, pendingOpen, set: setUi } = useUi();
  const openPool = useOpenPool();
  // "View pool" from the create success dialog lands here, then opens the new pool.
  useEffect(() => {
    if (!pendingOpen) return;
    setUi({ pendingOpen: null });
    openPool(pendingOpen);
  }, [pendingOpen, setUi, openPool]);
  const pools = usePoolsInfinite(exploreQuery({ ...f, q }));
  const list = pools.data?.pages.flatMap((pg) => pg.items) ?? [];
  const total = pools.data?.pages[0]?.total ?? 0;
  const maxT = Math.max(1, ...list.map((p) => p.tvlUsd));

  return (
    <div className="card">
      <div className="toolbar">
        <label className="search">
          <SearchSmIcon />
          <input type="search" placeholder="Search ticker or stock" aria-label="Search pools" autoComplete="off" value={f.q} onChange={(e) => f.set({ q: e.target.value })} />
        </label>
        <div className="seg" role="group" aria-label="Paired with">
          {QUOTES.map(([v, l]) => (
            <button key={v} aria-pressed={f.quote === v} onClick={() => f.set({ quote: v })}>
              {l}
            </button>
          ))}
        </div>
        <button className="switch" role="switch" aria-checked={f.locked} onClick={() => f.set({ locked: !f.locked })}>
          <span className="knob" aria-hidden="true" />
          Locked or burned only
        </button>
        <select className="select" aria-label="Sort pools" value={f.sort} onChange={(e) => f.set({ sort: e.target.value as PoolSort })}>
          {SORTS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <span className="count" aria-live="polite">
          {pools.data ? `${total} ${total === 1 ? 'market' : 'markets'}` : ''}
        </span>
      </div>
      <div className="tscroll">
        <table className="mk ex">
          <thead>
            <tr>
              <th className="rank">#</th>
              <th>Pair</th>
              <th>Price</th>
              <th>24h</th>
              <th className="hide-xl">7d</th>
              <th>Volume</th>
              <th>Liquidity</th>
              <th className="hide-xl">Fee APR</th>
              <th>Status</th>
              <th className="hide-xl">Age</th>
            </tr>
          </thead>
          <tbody>
            {pools.isError ? (
              <tr className="empty-row">
                <td colSpan={10}>
                  Markets didn&apos;t load.{' '}
                  <button className="link" style={{ marginTop: 0 }} onClick={() => pools.refetch()}>
                    Try again
                  </button>
                </td>
              </tr>
            ) : pools.data && !list.length ? (
              <tr className="empty-row">
                <td colSpan={10}>No markets match. Try another ticker, or turn off &quot;Locked or burned only&quot;.</td>
              </tr>
            ) : (
              list.map((p, i) => <Row key={p.address} p={p} i={i} maxT={maxT} fresh={p.address === fresh} onOpen={() => openPool(p.address)} />)
            )}
          </tbody>
        </table>
      </div>
      {pools.hasNextPage && (
        <div className="more">
          <Button variant="glass" size="sm" onClick={() => pools.fetchNextPage()} disabled={pools.isFetchingNextPage}>
            {pools.isFetchingNextPage ? <span className="spin" aria-label="Loading" /> : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}
