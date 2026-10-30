'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ageHours,
  amt,
  feePct,
  fmtAge,
  pct,
  shortAddr,
  tiny,
  usd,
  venueInfo,
  type HolderSlice,
  type PoolDetail,
  type Timeframe,
} from '@oxbow/shared';
import { useLocale, useT } from '@/i18n/client';
import { INTL_TAG, type Locale } from '@/i18n/config';
import { fmtDateL, marketReason, marketWhen, relTimeL } from '@/i18n/format';
import type { Messages } from '@/i18n/en';
import { track } from '@/lib/analytics';
import { SAMPLE_DATA } from '@/lib/api/mode';
import { useChart, usePool, useTrades } from '@/lib/api/queries';
import { copyText } from '@/lib/copy';
import { useNow } from '@/lib/hooks';
import { links, siteUrl } from '@/lib/links';
import { WatchStar } from '../explore/ExploreView';
import { ChangePill, SafetyPill } from '../ui/badges';
import { ExtLink } from '../ui/ExtLink';
import { CloseIcon, CopyIcon, ExternalIcon, FlameIcon, HalfIcon, LockIcon, ShareIcon, UnlockIcon, WarnIcon } from '../ui/Icons';
import { CandleChart, PriceChart } from '../ui/Sparkline';
import { PairAvatar } from '../ui/TokenAvatar';
import { cx, Fmt } from '../ui/primitives';
import { TradePanel, type TradeTab } from './TradePanel';

/** Feed older than this while the market is open gets a warning. */
const STALE_MS = 5 * 60_000;

const HOLDER_COLOR = { BURNED: '#9ECFFF', LOCKED: '#3DDC97', CREATOR: '#FF5A6E', OTHER: '#4A5D74' } as const;

function holderLabel(h: HolderSlice, t: Messages, locale: Locale) {
  if (h.kind === 'LOCKED') return t.pool.holder.LOCKED(h.unlockAt ? fmtDateL(h.unlockAt, locale) : '—');
  return t.pool.holder[h.kind];
}

function LpNote({ p }: { p: PoolDetail }) {
  const t = useT();
  const locale = useLocale();
  const lp = p.lp;
  if (lp.status === 'BURNED')
    return (
      <div className="note burn">
        <FlameIcon />
        <span>{t.pool.note.BURNED}</span>
      </div>
    );
  if (lp.status === 'LOCKED')
    return (
      <div className="note ok">
        <LockIcon />
        <span suppressHydrationWarning>{t.pool.note.LOCKED(lp.unlockAt ? fmtDateL(lp.unlockAt, locale) : '—')}</span>
      </div>
    );
  if (lp.status === 'PARTIAL')
    return (
      <div className="note mid">
        <HalfIcon />
        <span>{t.pool.note.PARTIAL(100 - lp.lockedPct)}</span>
      </div>
    );
  return (
    <div className="note warn">
      <UnlockIcon />
      <span>{t.pool.note.UNLOCKED}</span>
    </div>
  );
}

const hoverLabel = (ts: number, tf: Timeframe, locale: Locale) =>
  new Date(ts).toLocaleString(INTL_TAG[locale], tf === '1W' ? { month: 'short', day: 'numeric', hour: 'numeric' } : { hour: 'numeric', minute: '2-digit' });

function ShareMenu({ p }: { p: PoolDetail }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) {
        if (e instanceof KeyboardEvent) e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close, true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close, true);
    };
  }, [open]);
  const url = siteUrl('/pool/' + p.address);
  const text = t.pool.shareText(`${p.base.symbol}/${p.quote.symbol}`, usd(p.priceUsd));
  return (
    <div className="share" ref={ref}>
      <button className="icon-btn" aria-label={t.pool.share} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>
        <ShareIcon />
      </button>
      {open && (
        <div className="sharemenu" role="menu">
          <a role="menuitem" href={links.shareOnX(text, url)} target="_blank" rel="noopener noreferrer" onClick={() => track('pool_shared', { via: 'x' })}>
            {t.pool.postX} <ExternalIcon />
          </a>
          <button
            role="menuitem"
            onClick={() => {
              void copyText(url, t.common.linkCopied);
              track('pool_shared', { via: 'link' });
              setOpen(false);
            }}
          >
            {t.pool.copyLink}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Header row of the drawer (`.drawer-h`). Same element structure while loading,
 * missing and loaded, so the Close button (focused on open) is never remounted.
 */
function DrawerHeader({ p, state, onClose }: { p?: PoolDetail; state?: string; onClose?: () => void }) {
  const t = useT();
  return (
    <div className="drawer-h">
      {p ? <PairAvatar base={p.base} quote={p.quote} size={40} /> : <span className={state === 'loading' ? 'spin' : undefined} />}
      <div>
        {p ? (
          <>
            <b>
              {p.base.symbol}/{p.quote.symbol}
            </b>
            <small>{t.pool.sub(p.base.name, venueInfo(p.venue).label, feePct(p.feeBps))}</small>
          </>
        ) : (
          <b>{state === 'loading' ? t.pool.loading : t.pool.notFound}</b>
        )}
      </div>
      <div className="dh-acts">
        {p && <WatchStar address={p.address} pair={`${p.base.symbol}/${p.quote.symbol}`} className="icon-btn star" />}
        {p && <ShareMenu p={p} />}
        {onClose && (
          <button className="icon-btn" data-close-drawer onClick={onClose} aria-label={t.common.close}>
            <CloseIcon />
          </button>
        )}
      </div>
    </div>
  );
}

/** "The US stock market is closed…" for stock-paired pools, plus a stale-feed warning. */
function MarketNote({ p }: { p: PoolDetail }) {
  const t = useT();
  const locale = useLocale();
  const now = useNow(30_000);
  const q = p.quote;
  const age = now - Date.parse(q.priceUpdatedAt);
  const stale = age > STALE_MS && (!q.market || q.market.status === 'OPEN');
  return (
    <>
      {q.market && q.market.status === 'CLOSED' && (
        <div className="note mid" suppressHydrationWarning>
          <HalfIcon />
          <span>{t.market.closedNote(q.name, marketReason(q.market, t), q.symbol, marketWhen(q.market.nextChange, locale))}</span>
        </div>
      )}
      {stale && (
        <div className="note warn">
          <WarnIcon />
          <span>{t.market.feedStale(relTimeL(Date.parse(q.priceUpdatedAt), t, now))}</span>
        </div>
      )}
      {q.notice && (
        <div className="note mid">
          <WarnIcon />
          <span>
            <b>{t.market.notice}:</b> {q.notice}
          </span>
        </div>
      )}
    </>
  );
}

function SafetySection({ p }: { p: PoolDetail }) {
  const t = useT();
  const s = p.safety;
  const age = s.tokenCreatedAt ? ageHours(s.tokenCreatedAt) / 24 : null;
  return (
    <div className="d-sec">
      <h4 className="label">{t.safety.title}</h4>
      <div className={cx('sfty', s.level.toLowerCase())}>
        <SafetyPill level={s.level} />
        <span>{t.safety.level[s.level]}</span>
      </div>
      {s.flags.length > 0 && (
        <ul className="flags">
          {s.flags.map((f) => (
            <li key={f} className={['FREEZABLE', 'TRANSFER_HOOK', 'PERMANENT_DELEGATE', 'CREATOR_PULLED_BEFORE'].includes(f) ? 'danger' : 'caution'}>
              <WarnIcon />
              {t.safety.flag[f]}
            </li>
          ))}
        </ul>
      )}
      <dl className="kv sfty-kv">
        <div>
          <dt>{t.safety.holders}</dt>
          <dd>{s.holderCount.toLocaleString('en-US')}</dd>
        </div>
        <div>
          <dt>{t.safety.top10}</dt>
          <dd className={s.top10Pct > 50 ? 'down' : undefined}>{pct(s.top10Pct)}</dd>
        </div>
        <div>
          <dt>{t.safety.age}</dt>
          <dd suppressHydrationWarning>{age == null ? '—' : t.safety.ageDays(age)}</dd>
        </div>
        <div>
          <dt>{t.safety.mintAuth}</dt>
          <dd className={s.mintAuthority ? 'down' : 'up'}>{s.mintAuthority ? t.safety.active : t.safety.revoked}</dd>
        </div>
        <div>
          <dt>{t.safety.freezeAuth}</dt>
          <dd className={s.freezeAuthority ? 'down' : 'up'}>{s.freezeAuthority ? t.safety.active : t.safety.revoked}</dd>
        </div>
        <div>
          <dt>{t.safety.creator}</dt>
          <dd className={s.creatorPulled ? 'down' : undefined}>{t.safety.creatorHistory(s.creatorPools, s.creatorPulled)}</dd>
        </div>
      </dl>
      <p className="fine">{t.safety.note}</p>
    </div>
  );
}

function RecentTrades({ p }: { p: PoolDetail }) {
  const t = useT();
  const now = useNow(15_000);
  const { data } = useTrades(p.address);
  return (
    <div className="d-sec">
      <h4 className="label">{t.pool.trades}</h4>
      {data && !data.length ? (
        <p className="fine">{t.pool.tradesEmpty}</p>
      ) : (
        <div className="tscroll">
          <table className="ttable">
            <thead>
              <tr>
                <th>{t.pool.tradeCols.side}</th>
                <th>{t.pool.tradeCols.amount}</th>
                <th>{p.base.symbol}</th>
                <th className="tw">{t.pool.tradeCols.wallet}</th>
                <th>{t.pool.tradeCols.time}</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).slice(0, 12).map((tr) => (
                <tr key={tr.sig}>
                  <td>
                    <span className={cx('ft', tr.side === 'BUY' ? 'buy' : 'sell')}>{t.pool.side[tr.side]}</span>
                  </td>
                  <td className={tr.side === 'BUY' ? 'up' : 'down'}>
                    <Fmt>{usd(tr.amountUsd)}</Fmt>
                  </td>
                  <td>
                    <Fmt>{amt(tr.baseAmount)}</Fmt>
                  </td>
                  <td className="tw">
                    <ExtLink href={links.account(tr.wallet)} icon={false}>
                      {shortAddr(tr.wallet)}
                    </ExtLink>
                  </td>
                  <td suppressHydrationWarning>
                    <ExtLink href={links.tx(tr.sig)} icon={false}>
                      {relTimeL(tr.ts, t, now)}
                    </ExtLink>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Everything below the header: chart, stats, safety, reserves, LP holders, trade box, trades, links. */
export function PoolDetails({ p, tab, onTab }: { p: PoolDetail; tab: TradeTab; onTab: (t: TradeTab) => void }) {
  const t = useT();
  const locale = useLocale();
  const [tf, setTf] = useState<Timeframe>('1D');
  const [kind, setKind] = useState<'line' | 'candles'>('line');
  const [hover, setHover] = useState<number | null>(null);
  const chart = useChart(p.address, tf);
  const points = chart.data?.points ?? [];
  const candles = chart.data?.candles ?? [];
  const hp = hover != null ? (kind === 'line' ? points[hover] : candles[hover] && { t: candles[hover]!.t, p: candles[hover]!.c }) : undefined;
  const hc = hover != null && kind === 'candles' ? candles[hover] : undefined;
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
            <>
              {hoverLabel(hp.t, tf, locale)}
              {hc && (
                <>
                  {' · '}O <Fmt>{usd(hc.o)}</Fmt> H <Fmt>{usd(hc.h)}</Fmt> L <Fmt>{usd(hc.l)}</Fmt> · Vol <Fmt>{usd(hc.v)}</Fmt>
                </>
              )}
            </>
          ) : (
            <>
              <Fmt>{tiny(p.priceQuote)}</Fmt> {t.home.perBase(p.quote.symbol, p.base.symbol)}
            </>
          )}
        </div>
        <div className="dt-chart-h">
          <span className="label">{t.home.price}</span>
          <div className="dt-ctrls">
            <div className="tf" role="group" aria-label={t.pool.chartType}>
              {(['line', 'candles'] as const).map((k) => (
                <button
                  key={k}
                  aria-pressed={kind === k}
                  onClick={() => {
                    setKind(k);
                    setHover(null);
                  }}
                >
                  {k === 'line' ? t.pool.line : t.pool.candles}
                </button>
              ))}
            </div>
            <div className="tf" role="group" aria-label={t.home.timeRange}>
              {(['1H', '1D', '1W'] as const).map((x) => (
                <button
                  key={x}
                  aria-pressed={tf === x}
                  onClick={() => {
                    setTf(x);
                    setHover(null);
                  }}
                >
                  {x}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="chart">{kind === 'line' ? <PriceChart data={points.map((x) => x.p)} onHover={setHover} /> : <CandleChart candles={candles} onHover={setHover} />}</div>
        <MarketNote p={p} />
      </div>
      <dl className="kv">
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
          <dd className="up">{p.vol24hUsd ? pct(p.feeAprPct) : '—'}</dd>
        </div>
        <div>
          <dt>{t.home.kv.mcap}</dt>
          <dd>
            <Fmt>{usd(p.marketCapUsd)}</Fmt>
          </dd>
        </div>
        <div>
          <dt>{t.home.kv.fee}</dt>
          <dd>{feePct(p.feeBps)}</dd>
        </div>
        <div>
          <dt>{t.home.kv.created}</dt>
          <dd suppressHydrationWarning>{age < 1 ? t.common.justNow : t.common.ago(fmtAge(age))}</dd>
        </div>
      </dl>
      <SafetySection p={p} />
      <div className="d-sec">
        <h4 className="label">{t.pool.inPool}</h4>
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
        <h4 className="label">{t.pool.holdersTitle}</h4>
        <div className="stack" role="img" aria-label={p.holders.map((h) => `${holderLabel(h, t, locale)} ${h.pct}%`).join(', ')}>
          {p.holders.map((h, i) => (
            <i key={i} style={{ width: h.pct + '%', background: HOLDER_COLOR[h.kind] }} />
          ))}
        </div>
        <div className="legend">
          {p.holders.map((h, i) => (
            <div key={i}>
              <i style={{ background: HOLDER_COLOR[h.kind] }} />
              <span className="hl" suppressHydrationWarning>
                {holderLabel(h, t, locale)}
                {h.proof && (
                  <>
                    {' '}
                    <ExtLink href={h.proof.kind === 'tx' ? links.tx(h.proof.id) : links.account(h.proof.id)}>{t.pool.proof}</ExtLink>
                  </>
                )}
              </span>
              <span>{h.pct}%</span>
            </div>
          ))}
        </div>
        <LpNote p={p} />
      </div>
      <TradePanel pool={p} tab={tab} onTab={onTab} />
      <RecentTrades p={p} />
      <div className="d-sec">
        <h4 className="label">{t.pool.links}</h4>
        <div className="links">
          <ExtLink href={links.account(p.address)}>Solscan · {t.pool.linkPool}</ExtLink>
          <ExtLink href={links.token(p.base.mint)}>Solscan · {t.pool.linkToken}</ExtLink>
          <ExtLink href={links.account(p.creator)}>Solscan · {t.pool.linkCreator}</ExtLink>
          {links.mainnetOnly && <ExtLink href={links.dexscreener(p.address)}>DexScreener</ExtLink>}
          {links.mainnetOnly && <ExtLink href={links.birdeye(p.base.mint)}>Birdeye</ExtLink>}
        </div>
        {SAMPLE_DATA && <p className="fine">{t.pool.sampleLinks}</p>}
      </div>
      <div className="addr">
        {t.pool.poolLabel}
        <code>{p.address}</code>
        <button className="icon-btn" onClick={() => copyText(p.address, t.common.copied)} aria-label={t.pool.copyPool}>
          <CopyIcon />
        </button>
      </div>
    </div>
  );
}

/** Loads a pool and renders header + details. Used by the drawer and the full page. */
export function PoolView({ address, tab: initialTab, onClose }: { address: string; tab: TradeTab; onClose?: () => void }) {
  const t = useT();
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
            <h3>{t.pool.notFoundTitle}</h3>
            <p>{t.pool.notFoundBody}</p>
          </div>
        )
      )}
    </>
  );
}
