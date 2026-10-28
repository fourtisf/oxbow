'use client';

import { useState } from 'react';
import {
  ageHours,
  amt,
  feePct,
  fmtAge,
  fmtDate,
  pct,
  tiny,
  usd,
  venueInfo,
  type HolderSlice,
  type PoolDetail,
  type Timeframe,
} from '@oxbow/shared';
import { useChart, usePool } from '@/lib/api/queries';
import { copyText } from '@/lib/copy';
import { CloseIcon, CopyIcon, FlameIcon, HalfIcon, LockIcon, UnlockIcon } from '../ui/Icons';
import { PriceChart } from '../ui/Sparkline';
import { PairAvatar } from '../ui/TokenAvatar';
import { ChangePill, Fmt } from '../ui/primitives';
import { TradePanel, type TradeTab } from './TradePanel';

const HOLDER = {
  BURNED: { c: '#9ECFFF', l: () => 'Burned' },
  LOCKED: { c: '#3DDC97', l: (h: HolderSlice) => 'Locked until ' + (h.unlockAt ? fmtDate(h.unlockAt) : '—') },
  CREATOR: { c: '#FF5A6E', l: () => 'Creator wallet' },
  OTHER: { c: '#4A5D74', l: () => 'Other providers' },
} as const;

function LpNote({ p }: { p: PoolDetail }) {
  const lp = p.lp;
  if (lp.status === 'BURNED')
    return (
      <div className="note burn">
        <FlameIcon />
        <span>This liquidity was burned. Nobody, including the creator, can withdraw it.</span>
      </div>
    );
  if (lp.status === 'LOCKED')
    return (
      <div className="note ok">
        <LockIcon />
        <span suppressHydrationWarning>Locked until {lp.unlockAt ? fmtDate(lp.unlockAt) : '—'}. The creator can&apos;t withdraw before then.</span>
      </div>
    );
  if (lp.status === 'PARTIAL')
    return (
      <div className="note mid">
        <HalfIcon />
        <span>{100 - lp.lockedPct}% of this liquidity isn&apos;t locked. The creator can withdraw that part at any time.</span>
      </div>
    );
  return (
    <div className="note warn">
      <UnlockIcon />
      <span>The creator can withdraw this liquidity at any time. If they do, you may not be able to sell.</span>
    </div>
  );
}

const hoverLabel = (t: number, tf: Timeframe) =>
  new Date(t).toLocaleString('en-US', tf === '1W' ? { month: 'short', day: 'numeric', hour: 'numeric' } : { hour: 'numeric', minute: '2-digit' });

/**
 * Header row of the drawer (`.drawer-h`). Same element structure while loading,
 * missing and loaded, so the Close button (focused on open) is never remounted.
 */
function DrawerHeader({ p, state, onClose }: { p?: PoolDetail; state?: string; onClose?: () => void }) {
  return (
    <div className="drawer-h">
      {p ? <PairAvatar base={p.base} quote={p.quote} size={40} /> : <span className={state === 'loading' ? 'spin' : undefined} />}
      <div>
        {p ? (
          <>
            <b>
              {p.base.symbol}/{p.quote.symbol}
            </b>
            <small>
              {p.base.name} on {venueInfo(p.venue).label}, {feePct(p.feeBps)} fee
            </small>
          </>
        ) : (
          <b>{state === 'loading' ? 'Loading pool' : 'Pool not found'}</b>
        )}
      </div>
      {onClose && (
        <button className="icon-btn" data-close-drawer onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>
      )}
    </div>
  );
}

/** Everything below the header: price chart, stats, reserves, LP holders, trade box, address. */
export function PoolDetails({ p, tab, onTab }: { p: PoolDetail; tab: TradeTab; onTab: (t: TradeTab) => void }) {
  const [tf, setTf] = useState<Timeframe>('1D');
  const [hover, setHover] = useState<number | null>(null);
  const chart = useChart(p.address, tf);
  const points = chart.data?.points ?? [];
  const hp = hover != null ? points[hover] : undefined;
  const age = ageHours(p.createdAt);

  return (
    <div className="drawer-b">
      <div className="d-sec">
        <div className="dt-price" style={{ marginTop: 0 }}>
          <span className="big">
            <Fmt>{usd(hp ? hp.p : p.priceUsd)}</Fmt>
          </span>
          <ChangePill value={p.change24h} />
        </div>
        <div className="dt-sub" suppressHydrationWarning>
          {hp ? (
            hoverLabel(hp.t, tf)
          ) : (
            <>
              <Fmt>{tiny(p.priceQuote)}</Fmt> {p.quote.symbol} per {p.base.symbol}
            </>
          )}
        </div>
        <div className="dt-chart-h">
          <span className="label">Price</span>
          <div className="tf" role="group" aria-label="Time range">
            {(['1H', '1D', '1W'] as const).map((t) => (
              <button
                key={t}
                aria-pressed={tf === t}
                onClick={() => {
                  setTf(t);
                  setHover(null);
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="chart">
          <PriceChart data={points.map((x) => x.p)} onHover={setHover} />
        </div>
      </div>
      <dl className="kv">
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
          <dd className="up">{p.vol24hUsd ? pct(p.feeAprPct) : '—'}</dd>
        </div>
        <div>
          <dt>Mkt cap</dt>
          <dd>
            <Fmt>{usd(p.marketCapUsd)}</Fmt>
          </dd>
        </div>
        <div>
          <dt>Fee</dt>
          <dd>{feePct(p.feeBps)}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd suppressHydrationWarning>{age < 1 ? 'Just now' : fmtAge(age) + ' ago'}</dd>
        </div>
      </dl>
      <div className="d-sec">
        <h4 className="label">What&apos;s in the pool</h4>
        <div className="resbar">
          <i style={{ width: '50%', background: 'linear-gradient(90deg,#3E6EA6,#E2F0FF)' }} />
          <i style={{ width: '50%', background: 'linear-gradient(90deg,#A6F3CB,#16804B)' }} />
        </div>
        <div className="res-l">
          <div>
            <span>{p.base.symbol}</span>
            <Fmt>{amt(p.reserveBase)}</Fmt>
          </div>
          <div>
            <span>{p.quote.symbol}</span>
            <Fmt>{amt(p.reserveQuote)}</Fmt>
          </div>
        </div>
      </div>
      <div className="d-sec">
        <h4 className="label">Who holds the liquidity</h4>
        <div className="stack" role="img" aria-label={p.holders.map((h) => `${HOLDER[h.kind].l(h)} ${h.pct}%`).join(', ')}>
          {p.holders.map((h, i) => (
            <i key={i} style={{ width: h.pct + '%', background: HOLDER[h.kind].c }} />
          ))}
        </div>
        <div className="legend">
          {p.holders.map((h, i) => (
            <div key={i}>
              <i style={{ background: HOLDER[h.kind].c }} />
              <span style={{ marginLeft: 0, font: 'inherit', color: 'inherit' }} suppressHydrationWarning>
                {HOLDER[h.kind].l(h)}
              </span>
              <span>{h.pct}%</span>
            </div>
          ))}
        </div>
        <LpNote p={p} />
      </div>
      <TradePanel pool={p} tab={tab} onTab={onTab} />
      <div className="addr">
        Pool<code>{p.address}</code>
        <button className="icon-btn" onClick={() => copyText(p.address)} aria-label="Copy pool address">
          <CopyIcon />
        </button>
      </div>
    </div>
  );
}

/** Loads a pool and renders header + details. Used by the drawer and the full page. */
export function PoolView({ address, tab: initialTab, onClose }: { address: string; tab: TradeTab; onClose?: () => void }) {
  const { data: p, isLoading } = usePool(address);
  const [tab, setTab] = useState<TradeTab>(initialTab);
  return (
    <>
      <DrawerHeader p={p ?? undefined} state={isLoading ? 'loading' : 'missing'} onClose={onClose} />
      {p ? (
        <PoolDetails p={p} tab={tab} onTab={setTab} />
      ) : (
        !isLoading && (
          <div className="state">
            <h3>We couldn&apos;t find this pool</h3>
            <p>Only pools verified on-chain are listed. Check the address and try again.</p>
          </div>
        )
      )}
    </>
  );
}
