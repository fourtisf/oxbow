'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { relTime, shortAddr, usd, type ActivityItem, type ActivityKind } from '@oxbow/shared';
import { api } from '@/lib/api';
import { poolHref } from '@/lib/nav';
import { prefersReducedMotion, useNow } from '@/lib/hooks';
import { PulseIcon } from '../ui/Icons';
import { PairAvatar } from '../ui/TokenAvatar';
import { Fmt } from '../ui/primitives';

const KIND: Record<ActivityKind, { cls: string; label: string }> = {
  BUY: { cls: 'buy', label: 'BUY' },
  SELL: { cls: 'sell', label: 'SELL' },
  ADD_LP: { cls: 'lp', label: 'ADD LP' },
  POOL: { cls: 'new', label: 'POOL' },
};

const MAX = 12;

/** Home "Live activity" feed. Mock items now; the API's SSE stream in M5. */
export function LiveFeed() {
  const [items, setItems] = useState<{ it: ActivityItem; fresh: boolean }[]>([]);
  const now = useNow(1000);

  useEffect(() => {
    let alive = true;
    api.recentActivity().then((r) => {
      if (alive) setItems((cur) => (cur.length ? cur : r.map((it) => ({ it, fresh: false }))));
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
          Live activity
        </h2>
        <span className="lnk">
          <span className="live" aria-hidden="true" />
          Streaming
        </span>
      </div>
      <div className="feed-list">
        <div style={{ position: 'absolute', inset: 0 }}>
          {items.map(({ it, fresh }) => {
            const k = KIND[it.kind];
            return (
              <Link key={it.id} className="fi" href={poolHref(it.pool.address)} scroll={false} style={fresh ? undefined : { animation: 'none' }}>
                <span className={'ft ' + k.cls}>{k.label}</span>
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
                  <small>{relTime(it.ts, Math.max(now, it.ts))}</small>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
