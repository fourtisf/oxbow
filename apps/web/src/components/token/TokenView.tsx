'use client';

import { amt, compact, flagSeverity, pct, usd, type TokenDetail } from '@oxbow/shared';
import { useT } from '@/i18n/client';
import { ageShort, relTimeL } from '@/i18n/format';
import { track } from '@/lib/analytics';
import { useToken } from '@/lib/api/queries';
import { copyText } from '@/lib/copy';
import { useNow } from '@/lib/hooks';
import { links } from '@/lib/links';
import { useTrade } from '@/lib/store/trade';
import { Feed } from '../feed/Feed';
import { ChangePill, SafetyPill, VerifiedChip } from '../ui/badges';
import { CopyIcon, WarnIcon } from '../ui/Icons';
import { ExtLink } from '../ui/ExtLink';
import { Button, cx, Fmt } from '../ui/primitives';
import { TokenAvatar } from '../ui/TokenAvatar';
import { WalletTag } from '../ui/WalletTag';

function Safety({ d }: { d: TokenDetail }) {
  const t = useT();
  const check = (v: boolean | null) => (v === null ? <span className="muted">{t.token.unknown}</span> : v ? <span className="up">{t.token.revoked}</span> : <span className="down">{t.token.live}</span>);
  return (
    <section className="card safety" aria-labelledby="safe-h">
      <div className="hd">
        <h2 id="safe-h">{t.token.safety}</h2>
        <SafetyPill level={d.safety.level} />
      </div>
      <dl className="checks">
        <div>
          <dt>{t.token.checks.mint}</dt>
          <dd>{check(d.mintAuthorityOff)}</dd>
        </div>
        <div>
          <dt>{t.token.checks.freeze}</dt>
          <dd>{check(d.freezeAuthorityOff)}</dd>
        </div>
        <div>
          <dt>{t.token.checks.top10}</dt>
          <dd className="mono">{d.topHoldersPct === null ? t.token.unknown : pct(d.topHoldersPct)}</dd>
        </div>
        <div>
          <dt>{t.token.checks.dev}</dt>
          <dd className="mono">{d.devPct === null ? t.token.unknown : pct(d.devPct)}</dd>
        </div>
        <div>
          <dt>{t.token.organic}</dt>
          <dd className="mono">{d.organicScore === null ? t.token.unknown : Math.round(d.organicScore)}</dd>
        </div>
      </dl>
      {d.safety.flags.length > 0 && (
        <ul className="flags">
          {d.safety.flags.map((f) => (
            <li key={f} className={flagSeverity(f)}>
              <WarnIcon /> {t.token.flags[f]}
            </li>
          ))}
        </ul>
      )}
      <p className="fine">{t.token.safetyLede}</p>
    </section>
  );
}

export function TokenView({ mint }: { mint: string }) {
  const t = useT();
  const now = useNow(30_000);
  const { data: d, isLoading } = useToken(mint);
  const open = useTrade((s) => s.open);
  if (isLoading && d === undefined)
    return (
      <div className="loading">
        <span className="spin" /> {t.common.loading}
      </div>
    );
  if (!d)
    return (
      <div className="card empty-card">
        <div className="empty">
          <h3>{t.token.notFound}</h3>
          <p>{t.token.notFoundBody}</p>
        </div>
      </div>
    );
  const danger = d.safety.level === 'DANGER';
  const trade = (side: 'BUY' | 'SELL') => {
    open({ token: d, side, danger });
    track('trade_opened', { side, from: 'token' });
  };
  return (
    <>
      <header className="card thead">
        <TokenAvatar asset={d} size={64} eager />
        <div className="thead-main">
          <h1>
            {d.symbol}
            {d.verified && <VerifiedChip />}
          </h1>
          <p className="muted">{d.name}</p>
          <div className="waddr">
            <span className="mono">{mint.slice(0, 6) + '…' + mint.slice(-6)}</span>
            <button type="button" className="icon-btn sm" aria-label={t.common.copyAddress} onClick={() => copyText(mint)}>
              <CopyIcon />
            </button>
          </div>
        </div>
        <div className="tprice">
          <b className="mono">{d.usdPrice === null ? '—' : <Fmt>{usd(d.usdPrice)}</Fmt>}</b>
          {d.change24h !== null && <ChangePill value={d.change24h} />}
        </div>
        <div className="tacts">
          <Button size="lg" onClick={() => trade('BUY')}>
            {t.token.buy}
          </Button>
          <Button size="lg" variant="glass" onClick={() => trade('SELL')}>
            {t.token.sell}
          </Button>
        </div>
      </header>

      <dl className="tkv">
        <div className="card">
          <dt className="label">{t.token.mcap}</dt>
          <dd className="mono">{d.mcap === null ? '—' : '$' + compact(d.mcap)}</dd>
        </div>
        <div className="card">
          <dt className="label">{t.token.liquidity}</dt>
          <dd className={cx('mono', d.safety.flags.includes('LOW_LIQUIDITY') && 'down')}>{d.liquidity === null ? '—' : '$' + compact(d.liquidity)}</dd>
        </div>
        <div className="card">
          <dt className="label">{t.token.holders}</dt>
          <dd className="mono">{d.holderCount === null ? '—' : amt(d.holderCount)}</dd>
        </div>
        <div className="card">
          <dt className="label">{t.token.age}</dt>
          <dd className="mono" suppressHydrationWarning>
            {d.launchedAt ? ageShort(d.launchedAt, now) : '—'}
          </dd>
        </div>
      </dl>

      <div className="wgrid">
        <div className="wcol">
          <Safety d={d} />
          <section className="card" aria-labelledby="tr-h">
            <div className="hd">
              <h2 id="tr-h">{t.token.traders}</h2>
              <span className="lnk mono">{d.traders.length}</span>
            </div>
            {d.traders.length ? (
              <div className="tscroll">
                <table className="dtable">
                  <thead>
                    <tr>
                      <th>{t.token.th.wallet}</th>
                      <th className="r">{t.token.th.bought}</th>
                      <th className="r">{t.token.th.sold}</th>
                      <th className="r">{t.token.th.status}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.traders.map((w) => (
                      <tr key={w.address}>
                        <td>
                          <WalletTag address={w.address} label={w.label} featured={w.featured} size={24} />
                          <small className="muted rel" suppressHydrationWarning>
                            {relTimeL(Date.parse(w.lastTradeAt), t, now)}
                          </small>
                        </td>
                        <td className="r mono up">
                          <Fmt>{usd(w.boughtUsd)}</Fmt>
                        </td>
                        <td className="r mono down">
                          <Fmt>{usd(w.soldUsd)}</Fmt>
                        </td>
                        <td className="r">
                          <span className={cx('hpill', w.netAmount > 0 ? 'hold' : 'out')}>{w.netAmount > 0 ? t.token.holding : t.token.exited}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="feed-empty">{t.token.tradersEmpty}</p>
            )}
          </section>
          <div className="tlinks">
            <span className="label">{t.token.links}</span>
            <ExtLink href={links.token(mint)}>{t.common.solscan}</ExtLink>
            <ExtLink href={links.birdeye(mint)}>{t.common.birdeye}</ExtLink>
            <ExtLink href={links.dexscreener(mint)}>{t.common.dexscreener}</ExtLink>
          </div>
        </div>
        <Feed mint={mint} title={t.token.trades} scopes={false} />
      </div>
    </>
  );
}
