'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { amt, shortAddr, usd, type Holding, type WalletDetail } from '@oxbow/shared';
import { useLocale, useT } from '@/i18n/client';
import { fmtDateL, relTimeL } from '@/i18n/format';
import { track } from '@/lib/analytics';
import { api } from '@/lib/api';
import { ApiError } from '@/lib/api/http';
import { qk } from '@/lib/api/keys';
import { useWalletDetail } from '@/lib/api/queries';
import { copyText } from '@/lib/copy';
import { useNow } from '@/lib/hooks';
import { links } from '@/lib/links';
import { askPermission } from '@/lib/notify';
import { useFollow, useWalletName } from '@/lib/store/follow';
import { toast } from '@/lib/store/toast';
import { useTrade } from '@/lib/store/trade';
import { Feed } from '../feed/Feed';
import { FeaturedChip, Pnl, SmartChip } from '../ui/badges';
import { CopyIcon, ExternalIcon, StarIcon } from '../ui/Icons';
import { Button, cx, Fmt } from '../ui/primitives';
import { TokenTag } from '../ui/TokenTag';
import { WalletAvatar } from '../ui/WalletTag';

/** Follow, alerts and nickname controls for one wallet. */
export function FollowControls({ address, label }: { address: string; label: string | null }) {
  const t = useT();
  const name = useWalletName(address, label) ?? shortAddr(address);
  const following = useFollow((s) => s.list.find((f) => f.address === address));
  const { follow, unfollow, setAlerts } = useFollow();

  const toggleAlerts = async () => {
    if (following?.alerts) {
      setAlerts(address, false);
      toast(t.notify.disabled);
      return;
    }
    const p = await askPermission();
    if (p === 'unsupported') return toast(t.notify.unsupported);
    if (p !== 'granted') return toast(t.notify.blocked);
    if (!following) follow(address);
    setAlerts(address, true);
    toast(t.notify.enabled);
    track('alerts_on');
  };

  return (
    <div className="fctl">
      <Button
        variant={following ? 'glass' : 'primary'}
        size="sm"
        aria-pressed={!!following}
        aria-label={following ? t.walletPage.unfollowAria(name) : t.walletPage.followAria(name)}
        onClick={() => {
          if (following) unfollow(address);
          else {
            follow(address);
            track('wallet_followed');
            // Keep it tracked: following counts as interest.
            void api.addWallet(address).catch(() => {});
          }
        }}
      >
        <StarIcon filled={!!following} />
        {following ? t.walletPage.following : t.walletPage.follow}
      </Button>
      <button type="button" className={cx('switch sm', following?.alerts && 'on')} role="switch" aria-checked={!!following?.alerts} aria-label={t.walletPage.notifyAria} onClick={toggleAlerts}>
        <span className="knob" aria-hidden="true" />
        {following?.alerts ? t.walletPage.notifyOn : t.walletPage.notify}
      </button>
    </div>
  );
}

function Nickname({ address }: { address: string }) {
  const t = useT();
  const current = useFollow((s) => s.names[address] ?? '');
  const rename = useFollow((s) => s.rename);
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(current);
  if (!editing)
    return (
      <button
        type="button"
        className="link sm"
        onClick={() => {
          setV(current);
          setEditing(true);
        }}
      >
        {t.walletPage.rename}
      </button>
    );
  return (
    <form
      className="nick"
      onSubmit={(e) => {
        e.preventDefault();
        rename(address, v);
        setEditing(false);
      }}
    >
      <input value={v} onChange={(e) => setV(e.target.value)} maxLength={32} placeholder={t.walletPage.nickname} aria-label={t.walletPage.nickname} autoFocus />
      <Button size="sm" type="submit">
        {t.walletPage.save}
      </Button>
      <span className="fine">{t.walletPage.nicknameHint}</span>
    </form>
  );
}

function Header({ address, d }: { address: string; d: WalletDetail | null }) {
  const t = useT();
  const locale = useLocale();
  const name = useWalletName(address, d?.label ?? null);
  return (
    <header className="card whead">
      <WalletAvatar address={address} size={64} />
      <div className="whead-main">
        <h1>
          <span suppressHydrationWarning>{name ?? shortAddr(address)}</span>
          {d?.featured ? <FeaturedChip /> : d?.smart ? <SmartChip /> : null}
        </h1>
        <div className="waddr">
          <span className="mono">{shortAddr(address)}</span>
          <button type="button" className="icon-btn sm" aria-label={t.common.copyAddress} onClick={() => copyText(address)}>
            <CopyIcon />
          </button>
          <a className="icon-btn sm" href={links.account(address)} target="_blank" rel="noopener noreferrer" aria-label={t.common.solscan}>
            <ExternalIcon />
          </a>
          <Nickname address={address} />
        </div>
        {d && <p className="fine">{t.walletPage.since(fmtDateL(d.addedAt, locale))}</p>}
      </div>
      {d && <FollowControls address={address} label={d.label} />}
    </header>
  );
}

function Stat({ label, children, sub }: { label: string; children: React.ReactNode; sub?: string }) {
  return (
    <div className="card wstat">
      <span className="label">{label}</span>
      <b className="mono">{children}</b>
      {sub && <small className="muted">{sub}</small>}
    </div>
  );
}

function Holdings({ rows, name, address }: { rows: Holding[]; name: string | null; address: string }) {
  const t = useT();
  const open = useTrade((s) => s.open);
  if (!rows.length) return <p className="feed-empty">{t.walletPage.noHoldings}</p>;
  return (
    <div className="tscroll">
      <table className="dtable">
        <thead>
          <tr>
            <th>{t.walletPage.th.token}</th>
            <th className="r">{t.walletPage.th.amount}</th>
            <th className="r">{t.walletPage.th.value}</th>
            <th className="r">{t.walletPage.th.cost}</th>
            <th className="r">{t.walletPage.th.pnl}</th>
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
              <td className="r mono">{h.valueUsd === null ? '—' : <Fmt>{usd(h.valueUsd)}</Fmt>}</td>
              <td className="r mono muted">
                <Fmt>{usd(h.costUsd)}</Fmt>
              </td>
              <td className="r mono">
                <Pnl value={h.pnlUsd} />
                {h.pnlPct !== null && <small className={h.pnlPct >= 0 ? 'up' : 'down'}> {h.pnlPct >= 0 ? '+' : ''}{h.pnlPct.toFixed(0)}%</small>}
              </td>
              <td className="r">
                <Button size="sm" onClick={() => open({ token: h.token, side: 'BUY', from: { address, name } })}>
                  {t.token.buy}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NotTracked({ address }: { address: string }) {
  const t = useT();
  const qc = useQueryClient();
  const follow = useFollow((s) => s.follow);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="card empty-card">
      <div className="empty">
        <h3>{t.walletPage.notTracked}</h3>
        <p>{t.walletPage.notTrackedBody}</p>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              await api.addWallet(address);
              follow(address);
              track('wallet_tracked', { created: true });
              await qc.invalidateQueries({ queryKey: qk.wallet(address) });
            } catch (e) {
              const code = e instanceof ApiError ? e.code : 'failed';
              setErr(t.add.errors[code as keyof typeof t.add.errors] ?? t.add.errors.failed);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <span className="spin" /> : t.walletPage.track}
        </Button>
        {err && <p className="err">{err}</p>}
      </div>
    </div>
  );
}

export function WalletView({ address }: { address: string }) {
  const t = useT();
  const now = useNow(30_000);
  const { data: d, isLoading } = useWalletDetail(address);
  const name = useWalletName(address, d?.label ?? null);
  if (isLoading && d === undefined)
    return (
      <div className="loading">
        <span className="spin" /> {t.common.loading}
      </div>
    );
  if (!d)
    return (
      <>
        <Header address={address} d={null} />
        <NotTracked address={address} />
      </>
    );
  const s = d.stats;
  const reading = !d.backfilledAt;
  return (
    <>
      <Header address={address} d={d} />
      {reading && (
        <p className="note mid reading">
          <span className="spin" /> {t.walletPage.reading}
        </p>
      )}
      <div className="wstats">
        <Stat label={t.walletPage.stats.realized}>
          <Pnl value={s.realizedPnlUsd} />
        </Stat>
        <Stat label={t.walletPage.stats.unrealized}>
          <Pnl value={s.unrealizedPnlUsd} />
        </Stat>
        <Stat label={t.walletPage.stats.winRate} sub={t.walletPage.winsLosses(s.wins, s.losses)}>
          {s.winRate === null ? '—' : `${Math.round(s.winRate * 100)}%`}
        </Stat>
        <Stat label={t.walletPage.stats.trades} sub={t.walletPage.buysSells(s.buys, s.sells)}>
          {s.trades.toLocaleString('en-US')}
        </Stat>
        <Stat label={t.walletPage.stats.volume} sub={s.lastTradeAt ? relTimeL(Date.parse(s.lastTradeAt), t, now) : undefined}>
          <Fmt>{usd(s.volumeUsd)}</Fmt>
        </Stat>
      </div>

      <div className="wgrid">
        <div className="wcol">
          <section className="card" aria-labelledby="hold-h">
            <div className="hd">
              <h2 id="hold-h">{t.walletPage.holdings}</h2>
              <span className="lnk mono">{d.holdings.length}</span>
            </div>
            <Holdings rows={d.holdings} name={name} address={address} />
          </section>
          <section className="card" aria-labelledby="closed-h">
            <div className="hd">
              <h2 id="closed-h">{t.walletPage.closed}</h2>
              <span className="lnk mono">{d.closed.length}</span>
            </div>
            {d.closed.length ? (
              <div className="tscroll">
                <table className="dtable">
                  <thead>
                    <tr>
                      <th>{t.walletPage.th.token}</th>
                      <th className="r">{t.walletPage.th.bought}</th>
                      <th className="r">{t.walletPage.th.sold}</th>
                      <th className="r">{t.walletPage.th.pnl}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.closed.map((c) => (
                      <tr key={c.token.mint}>
                        <td>
                          <TokenTag token={c.token} />
                        </td>
                        <td className="r mono muted">
                          <Fmt>{usd(c.boughtUsd)}</Fmt>
                        </td>
                        <td className="r mono muted">
                          <Fmt>{usd(c.soldUsd)}</Fmt>
                        </td>
                        <td className="r mono">
                          <Pnl value={c.realizedPnlUsd} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="feed-empty">{t.walletPage.noClosed}</p>
            )}
          </section>
          <p className="fine wnote">{t.walletPage.note}</p>
        </div>
        <Feed wallet={address} title={t.walletPage.trades} refreshMs={reading ? 3000 : false} />
      </div>
    </>
  );
}
