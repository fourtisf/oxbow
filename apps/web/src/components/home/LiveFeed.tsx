'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { shortAddr, usd, type ActivityItem, type ActivityKind } from '@oxbow/shared';
import { useT } from '@/i18n/client';
import { relTimeL } from '@/i18n/format';
import { api } from '@/lib/api';
import { poolHref } from '@/lib/nav';
import { prefersReducedMotion, useNow } from '@/lib/hooks';
import { useWatchlist } from '@/lib/store/watchlist';
import { PulseIcon } from '../ui/Icons';
import { PairAvatar } from '../ui/TokenAvatar';
import { cx, Fmt } from '../ui/primitives';

const KIND_CLS: Record<ActivityKind, string> = { BUY: 'buy', SELL: 'sell', ADD_LP: 'lp', POOL: 'new' };
const MAX = 12;

/** Home "Live activity" feed. Mock items now; the API's SSE stream in M5. Watchlisted pools are highlighted. */
export function LiveFeed() {
  const t = useT();
  const watch = useWatchlist((s) => s.list);
  const [items, setItems] = useState<{ it: ActivityItem; fresh: boolean }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const now = useNow(1000);

  useEffect(() => {
    let alive = true;
    api.recentActivity().then((r) => {
      if (!alive) return;
      setItems((cur) => (cur.length ? cur : r.map((it) => ({ it, fresh: false }))));
      setLoaded(true);
    });
    if (prefersReducedMotion()) return () => void (alive = false);
    const off = api.subscribeActivity((it) => setItems((cur) => [{ it, fresh: true }, ...cur].slice(0, MAX)));
    return () => {
      alive = false;
      off();
    };
  }, []);

  return (
    <div className="card feed">
      <div className="hd">
        <h2>
          <span className="ic">
            <PulseIcon />
          </span>
          {t.home.liveActivity}
        </h2>
        <span className="lnk">
          <span className="live" aria-hidden="true" />
          {t.home.streaming}
        </span>
      </div>
      <div className="feed-list">
        <div style={{ position: 'absolute', inset: 0 }}>
          {loaded && !items.length && <p className="feed-empty">{t.home.feedEmpty}</p>}
          {items.map(({ it, fresh }) => (
            <Link
              key={it.id}
              className={cx('fi', watch.includes(it.pool.address) && 'watched')}
              href={poolHref(it.pool.address)}
              scroll={false}
              style={fresh ? undefined : { animation: 'none' }}
            >
              <span className={'ft ' + KIND_CLS[it.kind]}>{t.home.kind[it.kind]}</span>
              <PairAvatar base={it.pool.base} quote={it.pool.quote} size={26} />
              <div>
                <b>
                  {it.pool.base.symbol}/{it.pool.quote.symbol}
                </b>
                <small>{shortAddr(it.wallet)}</small>
              </div>
              <div className="r">
                <b className={it.kind === 'SELL' ? 'down' : it.kind === 'BUY' ? 'up' : ''}>
                  <Fmt>{usd(it.amountUsd)}</Fmt>
                </b>
                <small>{relTimeL(it.ts, t, Math.max(now, it.ts))}</small>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
