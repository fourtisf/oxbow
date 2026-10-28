'use client';

import Link from 'next/link';
import { buysPct, feePct, pct, tiny, usd, venueInfo, type PoolSummary, type Timeframe } from '@oxbow/shared';
import { useT } from '@/i18n/client';
import { TOP_QUERY } from '@/lib/api/presets';
import { useChart, useMovers, usePools } from '@/lib/api/queries';
import { poolHref, useOpenPool } from '@/lib/nav';
import { useUi } from '@/lib/store/ui';
import { ChangePill, LpBadge, SafetyMark } from '../ui/badges';
import { ArrowIcon, BoltIcon, TrendIcon } from '../ui/Icons';
import { Sparkline } from '../ui/Sparkline';
import { PairAvatar } from '../ui/TokenAvatar';
import { BracketCorners, ButtonLink, Fmt } from '../ui/primitives';

/** "Market movers" marquee: top 12 pools by 24h change. */
export function MoversMarquee() {
  const t = useT();
  const { data } = useMovers();
  const list = data ?? [];
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
        <span>{t.home.movers}</span>
      </div>
      <div className="mvwin">
        {data && !list.length ? (
          <p className="mv-empty">{t.home.moversEmpty}</p>
        ) : (
          <div className="track">
            {list.map((p) => item(p, false))}
            {list.map((p) => item(p, true))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Home "Top markets / 24h volume" table. Selecting a row fills the details panel. */
export function TopMarkets() {
  const t = useT();
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
          {t.home.topMarkets}
          <span className="hsub">
            {' '}
            <span className="sep">/</span> {t.home.by24hVol}
          </span>
        </h2>
        <Link className="lnk" href="/explore">
          {t.home.exploreMarkets} <ArrowIcon size={15} />
        </Link>
      </div>
      <div className="tscroll">
        <table className="mk">
          <thead>
            <tr>
              <th className="rank">{t.home.th.rank}</th>
              <th>{t.home.th.pair}</th>
              <th>{t.home.th.price}</th>
              <th>{t.home.th.ch24}</th>
              <th className="hide-sm hide-xl">{t.home.th.ch7}</th>
              <th className="hide-sm">{t.home.th.vol}</th>
              <th className="hide-sm">{t.home.th.liq}</th>
              <th className="hide-sm">{t.home.th.status}</th>
            </tr>
          </thead>
          <tbody>
            {data && !list.length && (
              <tr className="empty-row">
                <td colSpan={8}>
                  {t.home.noPools}{' '}
                  <Link className="link" href="/create" style={{ marginTop: 0 }}>
                    {t.home.createFirst}
                  </Link>
                </td>
              </tr>
            )}
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
                        <SafetyMark safety={p.safety} />
                      </b>
                      <small>{t.home.onVenue(p.base.name, venueInfo(p.venue).short)}</small>
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
  const t = useT();
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
        <div className="hd">
          <h2>{t.home.poolDetails}</h2>
        </div>
        {movers && <p className="state">{t.home.detailEmpty}</p>}
      </div>
    );
  const buys = buysPct(p);
  return (
    <div className="card detail">
      <BracketCorners />
      <div className="hd">
        <h2>
          {t.home.poolDetails} <span className="sep">/</span> {p.address === topMover?.address ? t.home.topMoverTag : t.home.selected}
        </h2>
      </div>
      <div className="dt-body">
        <div className="dt-top">
          <PairAvatar base={p.base} quote={p.quote} size={42} />
          <div>
            <b>
              {p.base.symbol}/{p.quote.symbol}
            </b>
            <small>{t.home.pairedWith(p.base.name, p.quote.name)}</small>
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
          <Fmt>{tiny(p.priceQuote)}</Fmt> {t.home.perBase(p.quote.symbol, p.base.symbol)}
        </div>
        <div className="dt-chart-h">
          <span className="label">{t.home.price}</span>
          <div className="tf" role="group" aria-label={t.home.timeRange}>
            {(['1H', '1D', '1W'] as Timeframe[]).map((tf) => (
              <button key={tf} aria-pressed={homeTf === tf} onClick={() => set({ homeTf: tf })}>
                {tf}
              </button>
            ))}
          </div>
        </div>
        <div className="chart">
          <Sparkline data={chart.data?.points.map((x) => x.p) ?? []} W={460} H={140} grid dot op={0.3} sw={2.2} />
        </div>
        <dl className="kv">
          <div>
            <dt>{t.home.kv.mcap}</dt>
            <dd>
              <Fmt>{usd(p.marketCapUsd)}</Fmt>
            </dd>
          </div>
          <div>
            <dt>{t.home.kv.liq}</dt>
            <dd>
              <Fmt>{usd(p.tvlUsd)}</Fmt>
            </dd>
          </div>
          <div>
            <dt>{t.home.kv.vol}</dt>
            <dd>
              <Fmt>{usd(p.vol24hUsd)}</Fmt>
            </dd>
          </div>
          <div>
            <dt>{t.home.kv.apr}</dt>
            <dd className="up">{pct(p.feeAprPct)}</dd>
          </div>
          <div>
            <dt>{t.home.kv.fee}</dt>
            <dd>{feePct(p.feeBps)}</dd>
          </div>
          <div>
            <dt>{t.home.kv.venue}</dt>
            <dd>{venueInfo(p.venue).short}</dd>
          </div>
        </dl>
        <div className="bs">
          <div className="bs-l">
            <span className="up">{t.home.buys(buys)}</span>
            <span className="down">{t.home.sells(100 - buys)}</span>
          </div>
          <div className="bs-bar" role="img" aria-label={t.home.buysAria(buys)}>
            <i style={{ width: buys + '%' }} />
            <i />
          </div>
        </div>
        <div className="dt-acts">
          <ButtonLink href={poolHref(p.address)} scroll={false}>
            {t.home.trade}
          </ButtonLink>
          <ButtonLink variant="glass" href={poolHref(p.address, 'add')} scroll={false}>
            {t.home.addLiquidity}
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
