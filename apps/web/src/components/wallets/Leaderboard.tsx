'use client';

import { usd } from '@oxbow/shared';
import { useT } from '@/i18n/client';
import { relTimeL } from '@/i18n/format';
import { useWallets } from '@/lib/api/queries';
import { useNow } from '@/lib/hooks';
import { Pnl } from '../ui/badges';
import { Fmt } from '../ui/primitives';
import { WalletTag } from '../ui/WalletTag';

/** Every tracked wallet, featured first, then by realized profit. */
export function Leaderboard() {
  const t = useT();
  const now = useNow(30_000);
  const { data = [], isLoading } = useWallets();
  if (!data.length) return <p className="feed-empty big">{isLoading ? <span className="spin" /> : t.wallets.empty}</p>;
  return (
    <div className="tscroll">
      <table className="dtable lb" aria-label={t.wallets.table}>
        <thead>
          <tr>
            <th>#</th>
            <th>{t.wallets.th.wallet}</th>
            <th className="r">{t.wallets.th.pnl}</th>
            <th className="r">{t.wallets.th.winRate}</th>
            <th className="r">{t.wallets.th.trades}</th>
            <th className="r">{t.wallets.th.volume}</th>
            <th className="r">{t.wallets.th.last}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((w, i) => (
            <tr key={w.address}>
              <td className="mono muted">{i + 1}</td>
              <td>
                <WalletTag address={w.address} label={w.label} featured={w.featured} smart={w.smart} />
              </td>
              <td className="r mono">
                <Pnl value={w.stats.realizedPnlUsd} />
              </td>
              <td className="r mono">{w.stats.winRate === null ? '—' : `${Math.round(w.stats.winRate * 100)}%`}</td>
              <td className="r mono">{w.stats.trades.toLocaleString('en-US')}</td>
              <td className="r mono">
                <Fmt>{usd(w.volume7dUsd)}</Fmt>
              </td>
              <td className="r muted" suppressHydrationWarning>
                {w.stats.lastTradeAt ? relTimeL(Date.parse(w.stats.lastTradeAt), t, now) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
