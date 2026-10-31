'use client';

import { amt, shortAddr, usd, type PortfolioHolding, type PortfolioTrade } from '@oxbow/shared';
import { useT } from '@/i18n/client';
import { relTimeL } from '@/i18n/format';
import { usePortfolio } from '@/lib/api/queries';
import { copyText } from '@/lib/copy';
import { useNow } from '@/lib/hooks';
import { links } from '@/lib/links';
import { useTrade } from '@/lib/store/trade';
import { useWallet } from '@/lib/store/wallet';
import { Pnl } from '../ui/badges';
import { CopyIcon, ExternalIcon, PieIcon } from '../ui/Icons';
import { Button, cx, Fmt } from '../ui/primitives';
import { TokenTag } from '../ui/TokenTag';

function Stat({ label, children, sub }: { label: string; children: React.ReactNode; sub?: string }) {
  return (
    <div className="card wstat">
      <span className="label">{label}</span>
      <b className="mono">{children}</b>
      {sub && <small className="muted">{sub}</small>}
    </div>
  );
}

function Holdings({ rows }: { rows: PortfolioHolding[] }) {
  const t = useT();
  const open = useTrade((s) => s.open);
  if (!rows.length) return <p className="feed-empty">{t.portfolio.noHoldings}</p>;
  return (
    <div className="tscroll">
      <table className="dtable">
        <thead>
          <tr>
            <th>{t.portfolio.th.token}</th>
            <th className="r">{t.portfolio.th.amount}</th>
            <th className="r">{t.portfolio.th.price}</th>
            <th className="r">{t.portfolio.th.value}</th>
            <th className="r">{t.portfolio.th.cost}</th>
            <th className="r">{t.portfolio.th.pnl}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((h) => (
            <tr key={h.token.mint}>
              <td>
                <TokenTag token={h.token} />
              </td>
              <td className="r mono">
                <Fmt>{amt(h.amount)}</Fmt>
              </td>
              <td className="r mono muted">{h.priceUsd === null ? '—' : <Fmt>{usd(h.priceUsd)}</Fmt>}</td>
              <td className="r mono">{h.valueUsd === null ? '—' : <Fmt>{usd(h.valueUsd)}</Fmt>}</td>
              <td className="r mono muted" title={h.costUsd === null ? t.portfolio.unknownCost : undefined}>
                {h.costUsd === null ? '—' : <Fmt>{usd(h.costUsd)}</Fmt>}
              </td>
              <td className="r mono">
                <Pnl value={h.pnlUsd} />
                {h.pnlPct !== null && (
                  <small className={h.pnlPct >= 0 ? 'up' : 'down'}>
                    {' '}
                    {h.pnlPct >= 0 ? '+' : ''}
                    {h.pnlPct.toFixed(0)}%
                  </small>
                )}
              </td>
              <td className="r">
                <span className="pf-acts">
                  <Button size="sm" variant="glass" onClick={() => open({ token: h.token, side: 'BUY' })} aria-label={`${t.portfolio.buy} ${h.token.symbol}`}>
                    {t.portfolio.buy}
                  </Button>
                  <Button size="sm" className="sellbtn" onClick={() => open({ token: h.token, side: 'SELL' })} aria-label={`${t.portfolio.sell} ${h.token.symbol}`}>
                    {t.portfolio.sell}
                  </Button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Trades({ rows, now }: { rows: PortfolioTrade[]; now: number }) {
  const t = useT();
  if (!rows.length) return <p className="feed-empty">{t.portfolio.noTrades}</p>;
  return (
    <ul className="pf-trades">
      {rows.map((r) => (
        <li key={`${r.signature}:${r.token.mint}:${r.side}`}>
          <span className={cx('tside', r.side === 'BUY' ? 'buy' : 'sell')}>{r.side}</span>
          <span className="mono">
            <Fmt>{amt(r.amount)}</Fmt>
          </span>
          <TokenTag token={r.token} size={20} />
          <span className="mono muted">
            <Fmt>{usd(r.usd)}</Fmt>
          </span>
          <span className="muted pf-when" suppressHydrationWarning>
            {relTimeL(Date.parse(r.ts), t, now)}
          </span>
          <a className="txl" href={links.tx(r.signature)} target="_blank" rel="noopener noreferrer" aria-label={t.feed.tx}>
            <ExternalIcon />
          </a>
        </li>
      ))}
    </ul>
  );
}

/** The connected wallet's portfolio: SOL, holdings with cost and profit, and its latest trades. */
export function PortfolioView() {
  const t = useT();
  const now = useNow(30_000);
  const wallet = useWallet((s) => s.wallet);
  const openWallet = useWallet((s) => s.open);
  const { data: p, isLoading, isError } = usePortfolio(wallet?.address ?? null);

  if (!wallet)
    return (
      <div className="card empty-card">
        <div className="empty">
          <span className="pf-icon" aria-hidden="true">
            <PieIcon width={28} height={28} />
          </span>
          <h3>{t.portfolio.connectTitle}</h3>
          <p>{t.portfolio.connectBody}</p>
          <Button onClick={() => openWallet()}>{t.portfolio.connect}</Button>
        </div>
      </div>
    );

  const head = (
    <div className="pf-head">
      <span className="mono">{shortAddr(wallet.address)}</span>
      <button type="button" className="icon-btn" aria-label={t.common.copyAddress} onClick={() => copyText(wallet.address)}>
        <CopyIcon />
      </button>
      <a className="link" href={links.account(wallet.address)} target="_blank" rel="noopener noreferrer">
        {t.portfolio.viewOnSolscan} <ExternalIcon />
      </a>
    </div>
  );

  if (!p)
    return (
      <>
        {head}
        {isLoading ? (
          <div className="loading">
            <span className="spin" /> {t.portfolio.loading}
          </div>
        ) : (
          isError && <p className="note mid">{t.portfolio.failed}</p>
        )}
      </>
    );

  return (
    <>
      {head}
      <div className="wstats pf-stats">
        <Stat label={t.portfolio.total}>
          <Fmt>{usd(p.totalUsd)}</Fmt>
        </Stat>
        <Stat label={t.portfolio.sol} sub={p.sol.valueUsd === null ? undefined : usd(p.sol.valueUsd)}>
          <Fmt>{amt(p.sol.amount)}</Fmt>
        </Stat>
        <Stat label={t.portfolio.unrealized}>
          <Pnl value={p.unrealizedPnlUsd} />
        </Stat>
        <Stat label={t.portfolio.realized} sub={t.portfolio.realizedSub}>
          <Pnl value={p.realizedPnlUsd} />
        </Stat>
      </div>

      <div className="pf-grid">
        <section className="card" aria-labelledby="pf-hold-h">
          <div className="hd">
            <h2 id="pf-hold-h">{t.portfolio.holdings}</h2>
            <span className="lnk mono">{p.holdings.length}</span>
          </div>
          <Holdings rows={p.holdings} />
        </section>
        <section className="card" aria-labelledby="pf-trades-h">
          <div className="hd">
            <h2 id="pf-trades-h">{t.portfolio.trades}</h2>
            <span className="lnk mono">{p.trades.length}</span>
          </div>
          <Trades rows={p.trades} now={now} />
        </section>
      </div>
      {p.historyTxs > 0 && <p className="fine pf-note">{t.portfolio.note(p.historyTxs)}</p>}
    </>
  );
}
