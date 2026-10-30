'use client';

import { amt, shortAddr, usd, type OrderFlow as Flow } from '@oxbow/shared';
import { useT } from '@/i18n/client';
import { relTimeL } from '@/i18n/format';
import { useFlow } from '@/lib/api/queries';
import { useNow } from '@/lib/hooks';
import { links, walletHref } from '@/lib/links';
import { BarsIcon, ExternalIcon } from '../ui/Icons';
import { cx, Fmt } from '../ui/primitives';
import Link from 'next/link';

const span = (sec: number) => (sec < 120 ? `${Math.max(1, Math.round(sec))}s` : sec < 7200 ? `${Math.round(sec / 60)}m` : `${Math.round(sec / 3600)}h`);

function Pressure({ f }: { f: Flow }) {
  const t = useT();
  const total = f.buys.usd + f.sells.usd;
  const buyPct = total ? Math.round((f.buys.usd / total) * 100) : 50;
  return (
    <div className="press">
      <div className="press-row">
        <span className="up">
          {t.token.flowBuys} <b className="mono">{buyPct}%</b> <small className="muted mono">({f.buys.count} · {usd(f.buys.usd)})</small>
        </span>
        <span className="down">
          <small className="muted mono">({f.sells.count} · {usd(f.sells.usd)})</small> <b className="mono">{100 - buyPct}%</b> {t.token.flowSells}
        </span>
      </div>
      <div className="press-bar" role="img" aria-label={`${t.token.flowBuys} ${buyPct}%, ${t.token.flowSells} ${100 - buyPct}%`}>
        <i className="b" style={{ width: `${buyPct}%` }} />
        <i className="s" style={{ width: `${100 - buyPct}%` }} />
      </div>
    </div>
  );
}

/** Fills grouped by price: buys to the left, sells to the right, the last price marked. */
function Book({ f }: { f: Flow }) {
  const t = useT();
  const max = Math.max(1, ...f.levels.map((l) => Math.max(l.buyUsd, l.sellUsd)));
  // The level the last price falls in.
  const lastIdx = f.lastPriceUsd === null || !f.levels.length ? -1 : f.levels.reduce((best, l, i) => (Math.abs(Math.log(l.priceUsd / f.lastPriceUsd!)) < Math.abs(Math.log(f.levels[best]!.priceUsd / f.lastPriceUsd!)) ? i : best), 0);
  return (
    <table className="book">
      <thead>
        <tr>
          <th className="r">{t.token.flowBuys}</th>
          <th className="c">{t.token.flowPrice}</th>
          <th>{t.token.flowSells}</th>
        </tr>
      </thead>
      <tbody>
        {f.levels.map((l, i) => (
          <tr key={i} className={cx(i === lastIdx && 'last')} title={i === lastIdx ? t.token.flowLast : undefined}>
            <td className="r">
              <span className="lvl b">
                <i style={{ width: `${(l.buyUsd / max) * 100}%` }} />
                <b className="mono">{l.buyUsd ? <Fmt>{usd(l.buyUsd)}</Fmt> : ''}</b>
              </span>
            </td>
            <td className="c mono">
              <Fmt>{usd(l.priceUsd)}</Fmt>
            </td>
            <td>
              <span className="lvl s">
                <i style={{ width: `${(l.sellUsd / max) * 100}%` }} />
                <b className="mono">{l.sellUsd ? <Fmt>{usd(l.sellUsd)}</Fmt> : ''}</b>
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function OrderFlow({ mint }: { mint: string }) {
  const t = useT();
  const now = useNow(10_000);
  const { data: f, isLoading } = useFlow(mint);
  return (
    <section className="card flow" aria-labelledby="flow-h">
      <div className="hd">
        <h2 id="flow-h">
          <span className="ic">
            <BarsIcon />
          </span>
          {t.token.flow}
          <span className="live" aria-hidden="true" />
        </h2>
        {f && f.trades.length > 0 && <span className="lnk mono">{t.token.flowWindow(span(f.windowSec))}</span>}
      </div>
      <p className="hd-sub">{t.token.flowLede}</p>
      {!f || !f.trades.length ? (
        <p className="feed-empty">{isLoading ? <span className="spin" /> : t.token.flowEmpty}</p>
      ) : (
        <>
          <Pressure f={f} />
          <div className="flow-grid">
            <Book f={f} />
            <div className="fills">
              <h3 className="label">{t.token.flowFills}</h3>
              <ul>
                {f.trades.slice(0, 30).map((x) => (
                  <li key={`${x.signature}:${x.trader}`} className={cx(x.tracked && 'tracked')}>
                    <span className={cx('mono', x.side === 'BUY' ? 'up' : 'down')}>
                      <Fmt>{usd(x.usd)}</Fmt>
                    </span>
                    <span className="mono muted">
                      <Fmt>{amt(x.amount)}</Fmt> @ <Fmt>{usd(x.priceUsd)}</Fmt>
                    </span>
                    <Link className={cx('mono who', x.tracked && 'tw')} href={walletHref(x.trader)} title={x.tracked ? t.token.flowTracked : undefined}>
                      {shortAddr(x.trader)}
                    </Link>
                    <span className="muted when" suppressHydrationWarning>
                      {relTimeL(Date.parse(x.ts), t, now)}
                    </span>
                    <a className="txl" href={links.tx(x.signature)} target="_blank" rel="noopener noreferrer" aria-label={t.feed.tx}>
                      <ExternalIcon />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
