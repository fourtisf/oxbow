'use client';

import Link from 'next/link';
import { useT } from '@/i18n/client';
import { useWallets } from '@/lib/api/queries';
import { Pnl } from '../ui/badges';
import { ArrowIcon, TrendIcon } from '../ui/Icons';
import { WalletTag } from '../ui/WalletTag';

/** The leaderboard's first rows. */
export function TopWallets({ limit = 6 }: { limit?: number }) {
  const t = useT();
  const { data = [], isLoading } = useWallets();
  return (
    <section className="card" aria-labelledby="top-h">
      <div className="hd">
        <h2 id="top-h">
          <span className="ic">
            <TrendIcon />
          </span>
          {t.top.title}
        </h2>
        <Link className="lnk" href="/wallets">
          {t.top.viewAll} <ArrowIcon size={16} />
        </Link>
      </div>
      {data.length ? (
        <ul className="toplist">
          {data.slice(0, limit).map((w) => (
            <li key={w.address}>
              <WalletTag address={w.address} label={w.label} featured={w.featured} />
              <span className="topnum">
                <Pnl value={w.stats.realizedPnlUsd} className="mono" />
                <small className="muted mono">{w.stats.winRate === null ? '—' : `${Math.round(w.stats.winRate * 100)}% ${t.wallets.th.winRate.toLowerCase()}`}</small>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="feed-empty">{isLoading ? <span className="spin" /> : t.top.empty}</p>
      )}
    </section>
  );
}
