'use client';

import Link from 'next/link';
import {
  buysPct,
  feePct,
  pct,
  tiny,
  usd,
  venueInfo,
  type PoolSummary,
  type Timeframe,
} from '@oxbow/shared';
import { useChart, useMovers, usePools } from '@/lib/api/queries';
import { TOP_QUERY } from '@/lib/api/presets';
import { poolHref, useOpenPool } from '@/lib/nav';
import { useUi } from '@/lib/store/ui';
import { ArrowIcon, BoltIcon, TrendIcon } from '../ui/Icons';
import { Sparkline } from '../ui/Sparkline';
import { PairAvatar } from '../ui/TokenAvatar';
import { BracketCorners, ButtonLink, ChangePill, Fmt, LpBadge } from '../ui/primitives';

/** "Market movers" marquee: top 12 pools by 24h change. */
export function MoversMarquee() {
  const { data = [] } = useMovers();
  const item = (p: PoolSummary, dup: boolean) => (
    <Link key={(dup ? 'b' : 'a') + p.address} className="mv" href={poolHref(p.address)} scroll={false} tabIndex={dup ? -1 : undefined} aria-hidden={dup || undefined}>
      <PairAvatar base={p.base} quote={p.quote} size={24} />
      <span>
        {p.base.symbol}/{p.quote.symbol}
      </span>
      <ChangePill value={p.change24h} />
    </Link>
  );
  return (
    <div className="card movers" id="movers">
      <div className="lbl">
        <BoltIcon />
        <span>Market movers</span>
      </div>
      <div className="mvwin">
        <div className="track">
          {data.map((p) => item(p, false))}
          {data.map((p) => item(p, true))}
        </div>
      </div>
    </div>
  );
}

/** Home "Top markets / 24h volume" table. Selecting a row fills the details panel. */
export function TopMarkets() {
  const { data } = usePools(TOP_QUERY);
  const { data: movers } = useMovers();
  const { homeSel, set } = useUi();
  const openPool = useOpenPool();
  const list = data?.items ?? [];
  const sel = homeSel ?? movers?.[0]?.address ?? null;
  const maxT = Math.max(1, ...list.map((p) => p.tvlUsd));

  const select = (p: PoolSummary) => {
    set({ homeSel: p.address });
    if (window.matchMedia('(max-width:1180px)').matches) openPool(p.address);
  };

  return (
    <div className="card">
      <div className="hd">
        <h2>
          <span className="ic">
            <TrendIcon size={18} />
          </span>
          Top markets
          <span className="hsub">
            {' '}
            <span className="sep">/</span> 24h volume
          </span>
        </h2>
        <Link className="lnk" href="/explore">
          Explore markets <ArrowIcon size={15} />
        </Link>
      </div>
      <div className="tscroll">
        <table className="mk">
          <thead>
            <tr>
              <th className="rank">#</th>
              <th>Pair</th>
              <th>Price</th>
              <th>24h</th>
              <th className="hide-sm hide-xl">7d</th>
              <th className="hide-sm">Volume</th>
              <th className="hide-sm">Liquidity</th>
              <th className="hide-sm">Status</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p, i) => (
              <tr
                key={p.address}
                tabIndex={0}
                aria-selected={sel === p.address}
                onClick={() => select(p)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    select(p);
                  }
                }}
              >
                <td className="rank">{String(i + 1).padStart(2, '0')}</td>
                <td>
                  <div className="pair">
                    <PairAvatar base={p.base} quote={p.quote} size={32} />
                    <div>
                      <b>
                        {p.base.symbol}/{p.quote.symbol}
                      </b>
                      <small>
                        {p.base.name} on {venueInfo(p.venue).short}
                      </small>
                    </div>
                  </div>
                </td>
                <td>
                  <Fmt>{usd(p.priceUsd)}</Fmt>
                </td>
                <td>
                  <ChangePill value={p.change24h} />
                </td>
                <td className="hide-sm hide-xl mini">
                  <Sparkline data={p.spark7d} W={96} H={30} area={false} sw={1.6} w={96} h={30} />
                </td>
                <td className="hide-sm">
                  <Fmt>{usd(p.vol24hUsd)}</Fmt>
                </td>
                <td className="hide-sm">
                  <span className="liqcell">
                    <Fmt>{usd(p.tvlUsd)}</Fmt>
                    <i style={{ width: Math.max(10, (p.tvlUsd / maxT) * 72) }} />
                  </span>
                </td>
                <td className="hide-sm">
                  <LpBadge lp={p.lp} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Home "Pool details" panel next to Top markets. */
export function PoolDetailPanel() {
  const { data: top } = usePools(TOP_QUERY);
  const { data: movers } = useMovers();
  const { homeSel, homeTf, set } = useUi();
  const topMover = movers?.[0];
  const p = (homeSel && (top?.items.find((x) => x.address === homeSel) ?? movers?.find((x) => x.address === homeSel))) || topMover;
  const chart = useChart(p?.address, homeTf);
  if (!p)
    return (
      <div className="card detail">
        <BracketCorners />
      </div>
    );
  const buys = buysPct(p);
  return (
    <div className="card detail">
      <BracketCorners />
      <div className="hd">
        <h2>
          Pool details <span className="sep">/</span> {p.address === topMover?.address ? 'Top mover' : 'Selected'}
        </h2>
      </div>
      <div className="dt-body">
        <div className="dt-top">
          <PairAvatar base={p.base} quote={p.quote} size={42} />
          <div>
            <b>
              {p.base.symbol}/{p.quote.symbol}
            </b>
            <small>
              {p.base.name} paired with {p.quote.name}
            </small>
          </div>
          <LpBadge lp={p.lp} />
        </div>
        <div className="dt-price">
          <span className="big">
            <Fmt>{usd(p.priceUsd)}</Fmt>
          </span>
          <ChangePill value={p.change24h} />
        </div>
        <div className="dt-sub">
          <Fmt>{tiny(p.priceQuote)}</Fmt> {p.quote.symbol} per {p.base.symbol}
        </div>
        <div className="dt-chart-h">
          <span className="label">Price</span>
          <div className="tf" role="group" aria-label="Time range">
            {(['1H', '1D', '1W'] as Timeframe[]).map((t) => (
              <button key={t} aria-pressed={homeTf === t} onClick={() => set({ homeTf: t })}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="chart">
          <Sparkline data={chart.data?.points.map((x) => x.p) ?? []} W={460} H={140} grid dot op={0.3} sw={2.2} />
        </div>
        <dl className="kv">
          <div>
            <dt>Mkt cap</dt>
            <dd>
              <Fmt>{usd(p.marketCapUsd)}</Fmt>
            </dd>
          </div>
          <div>
            <dt>Liquidity</dt>
            <dd>
              <Fmt>{usd(p.tvlUsd)}</Fmt>
            </dd>
          </div>
          <div>
            <dt>24h vol</dt>
            <dd>
              <Fmt>{usd(p.vol24hUsd)}</Fmt>
            </dd>
          </div>
          <div>
            <dt>Fee APR</dt>
            <dd className="up">{pct(p.feeAprPct)}</dd>
          </div>
          <div>
            <dt>Fee</dt>
            <dd>{feePct(p.feeBps)}</dd>
          </div>
          <div>
            <dt>Venue</dt>
            <dd>{venueInfo(p.venue).short}</dd>
          </div>
        </dl>
        <div className="bs">
          <div className="bs-l">
            <span className="up">BUYS {buys}%</span>
            <span className="down">SELLS {100 - buys}%</span>
          </div>
          <div className="bs-bar" role="img" aria-label={`${buys}% of 24h trades were buys`}>
            <i style={{ width: buys + '%' }} />
            <i />
          </div>
        </div>
        <div className="dt-acts">
          <ButtonLink href={poolHref(p.address)} scroll={false}>
            Trade
          </ButtonLink>
          <ButtonLink variant="glass" href={poolHref(p.address, 'add')} scroll={false}>
            Add liquidity
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
