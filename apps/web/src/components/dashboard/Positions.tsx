'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { amt, feePct, impermanentLossPct, pct, signed, usd, venueInfo, type Position } from '@oxbow/shared';
import { useLocale, useT } from '@/i18n/client';
import { fmtDateL, relTimeL } from '@/i18n/format';
import type { Messages } from '@/i18n/en';
import { track } from '@/lib/analytics';
import { invalidateAfterTx, usePositions, useWalletActivity } from '@/lib/api/queries';
import { chain } from '@/lib/chain/mock';
import { useNow } from '@/lib/hooks';
import { links } from '@/lib/links';
import { poolHref } from '@/lib/nav';
import { toast } from '@/lib/store/toast';
import { useWallet } from '@/lib/store/wallet';
import { BarsIcon, CloseIcon, DropIcon, ExternalIcon, LiquidIcon, TrendIcon, WalletIcon } from '../ui/Icons';
import { Modal } from '../ui/overlay';
import { PairAvatar } from '../ui/TokenAvatar';
import { Button, ButtonLink, cx, Fmt } from '../ui/primitives';

function lockNote(x: Position, t: Messages, locale: 'en' | 'id'): string {
  if (x.lock.status === 'UNLOCKED') return t.trade.withdrawAny;
  if (x.lock.status === 'BURNED') return t.dash.burned;
  return x.lock.unlockAt ? t.dash.unlocks(fmtDateL(x.lock.unlockAt, locale)) : t.dash.locked;
}

/** "+$12.40" / "-$3.10" */
const signedUsd = (n: number) => (n >= 0 ? '+' : '-') + usd(Math.abs(n));

function Empty({ icon, title, body, children }: { icon: ReactNode; title: string; body: string; children: ReactNode }) {
  const t = useT();
  return (
    <div className="card">
      <h2 className="sr-only">{t.dash.positions}</h2>
      <div className="empty">
        <div className="ring">{icon}</div>
        <h3>{title}</h3>
        <p>{body}</p>
        <div className="cta">{children}</div>
      </div>
    </div>
  );
}

function WithdrawDialog({ x, onClose, onDone }: { x: Position | null; onClose: () => void; onDone: (pct: number) => Promise<void> }) {
  const t = useT();
  const [p, setP] = useState(100);
  const [busy, setBusy] = useState(false);
  const pair = x ? `${x.pool.base.symbol}/${x.pool.quote.symbol}` : '';
  const openId = x?.id;
  // Each opening starts at MAX, not at the last amount picked.
  useEffect(() => {
    if (openId) setP(100);
  }, [openId]);
  const k = p / 100;
  return (
    <Modal open={!!x} onClose={onClose} label={t.dash.wTitle(pair)} busy={busy}>
      {x && (
        <>
          <div className="m-h">
            <h3>{t.dash.wTitle(pair)}</h3>
            <button className="icon-btn" onClick={onClose} aria-label={t.common.close}>
              <CloseIcon />
            </button>
          </div>
          <div className="wd">
            <div className="flabel">
              <span>{t.dash.wHow}</span>
              <b>{p}%</b>
            </div>
            <div className="chips" role="group" aria-label={t.dash.wHow}>
              {[25, 50, 75, 100].map((v) => (
                <button key={v} className="chip" aria-pressed={p === v} onClick={() => setP(v)}>
                  {v === 100 ? t.trade.max : v + '%'}
                </button>
              ))}
            </div>
            <input
              className="range"
              type="range"
              min={1}
              max={100}
              step={1}
              value={p}
              aria-label={t.dash.wHow}
              style={{ '--p': ((p - 1) / 99) * 100 + '%', marginTop: 16 } as CSSProperties}
              onChange={(e) => setP(+e.target.value)}
            />
            <dl className="pv-dl wd-out">
              <div>
                <dt>{t.dash.wReceive}</dt>
                <dd>
                  <Fmt>{amt(x.baseAmount * k)}</Fmt> {x.pool.base.symbol} + <Fmt>{amt(x.quoteAmount * k)}</Fmt> {x.pool.quote.symbol}
                </dd>
              </div>
              <div>
                <dt>{t.dash.th.value}</dt>
                <dd>
                  <Fmt>{usd(x.valueUsd * k)}</Fmt>
                </dd>
              </div>
            </dl>
            <Button
              block
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onDone(p);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t.dash.wBtn(p)}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

function Activity() {
  const t = useT();
  const wallet = useWallet((s) => s.wallet);
  const now = useNow(30_000);
  const { data } = useWalletActivity(wallet?.address);
  if (!wallet) return null;
  return (
    <div className="card block">
      <div className="hd">
        <h2>{t.dash.activity}</h2>
      </div>
      {data && !data.length ? (
        <p className="state">{t.dash.activityEmpty}</p>
      ) : (
        <ul className="alist">
          {(data ?? []).map((a) => (
            <li key={a.sig}>
              <span className={cx('ft', a.kind === 'REMOVE' ? 'sell' : a.kind === 'CLAIM' || a.kind === 'SWAP' ? 'buy' : a.kind === 'CREATE' ? 'new' : 'lp')}>{t.dash.kind[a.kind]}</span>
              <PairAvatar base={a.pool.base} quote={a.pool.quote} size={26} />
              <b>
                {a.pool.base.symbol}/{a.pool.quote.symbol}
              </b>
              <span className="amt">
                <Fmt>{usd(a.amountUsd)}</Fmt>
              </span>
              <span className="when" suppressHydrationWarning>
                {relTimeL(a.ts, t, now)}
              </span>
              <a className="xlink" href={links.tx(a.sig)} target="_blank" rel="noopener noreferrer" aria-label={t.dash.viewTx}>
                <ExternalIcon />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Dashboard body: wallet positions, PnL, fees to claim, manage, partial withdraw, history. */
export function Positions() {
  const t = useT();
  const locale = useLocale();
  const { wallet, open } = useWallet();
  const qc = useQueryClient();
  const { data: list, isLoading } = usePositions(wallet?.address);
  const [busy, setBusy] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState<Position | null>(null);

  if (!wallet)
    return (
      <Empty icon={<WalletIcon />} title={t.dash.noWalletTitle} body={t.dash.noWalletBody}>
        <Button onClick={() => open()}>{t.nav.selectWallet}</Button>
      </Empty>
    );
  if (isLoading || !list)
    return (
      <div className="card">
        <div className="state">
          <span className="spin" aria-label={t.dash.loading} />
        </div>
      </div>
    );
  if (!list.length)
    return (
      <>
        <Empty icon={<DropIcon />} title={t.dash.emptyTitle} body={t.dash.emptyBody}>
          <ButtonLink href="/create">{t.home.createPool}</ButtonLink>
          <ButtonLink variant="glass" href="/explore">
            {t.home.exploreMarkets}
          </ButtonLink>
        </Empty>
        <Activity />
      </>
    );

  const tv = list.reduce((s, x) => s + x.valueUsd, 0);
  const te = list.reduce((s, x) => s + x.unclaimedFeesUsd, 0);
  const tDep = list.reduce((s, x) => s + x.depositedUsd, 0);
  const pnl = tv + te - tDep;
  const created = list.filter((x) => x.isCreator).length;

  const claim = async (x: Position) => {
    setBusy('c' + x.id);
    try {
      const { amountUsd } = await chain.claimFees(wallet.address, x.id);
      toast(t.dash.claimed(usd(amountUsd)));
      track('fees_claimed');
      await invalidateAfterTx(qc);
    } catch {
      toast(t.common.somethingWrong);
    } finally {
      setBusy(null);
    }
  };

  const withdraw = async (pctOut: number) => {
    const x = withdrawing;
    if (!x) return;
    const pair = `${x.pool.base.symbol}/${x.pool.quote.symbol}`;
    try {
      await chain.withdraw(wallet.address, x.id, pctOut);
      toast(pctOut >= 100 ? t.dash.withdrew(pair) : t.dash.withdrewPart(pctOut, pair));
      track('liquidity_withdrawn', { pct: pctOut });
      setWithdrawing(null);
      await invalidateAfterTx(qc);
    } catch {
      toast(t.common.somethingWrong);
    }
  };

  return (
    <>
      <div className="dsum dsum4">
        <div className="card stat">
          <div className="top">
            <span className="label">{t.dash.yourLiq}</span>
            <span className="ic">
              <LiquidIcon />
            </span>
          </div>
          <div className="val">
            <Fmt>{usd(tv)}</Fmt>
          </div>
          <div className="sub">{t.dash.across(list.length)}</div>
        </div>
        <div className="card stat">
          <div className="top">
            <span className="label">{t.dash.fees}</span>
            <span className="ic" style={{ color: 'var(--up)' }}>
              <TrendIcon />
            </span>
          </div>
          <div className="val up">
            <Fmt>{usd(te)}</Fmt>
          </div>
          <div className="sub">{t.dash.feesSub}</div>
        </div>
        <div className="card stat">
          <div className="top">
            <span className="label">{t.dash.pnl}</span>
            <span className="ic" style={{ color: pnl >= 0 ? 'var(--up)' : 'var(--down)' }}>
              <TrendIcon />
            </span>
          </div>
          <div className={cx('val', pnl >= 0 ? 'up' : 'down')}>
            <Fmt>{signedUsd(pnl)}</Fmt>
          </div>
          <div className="sub">{t.dash.pnlSub}</div>
        </div>
        <div className="card stat">
          <div className="top">
            <span className="label">{t.dash.created}</span>
            <span className="ic">
              <BarsIcon />
            </span>
          </div>
          <div className="val">{created}</div>
          <div className="sub">{t.dash.thisWallet}</div>
        </div>
      </div>
      <div className="card">
        <div className="hd">
          <h2>{t.dash.positions}</h2>
        </div>
        <div className="prow head" aria-hidden="true">
          <div>{t.dash.th.pool}</div>
          <div>{t.dash.th.share}</div>
          <div>{t.dash.th.value}</div>
          <div>{t.dash.th.fees}</div>
          <div />
        </div>
        {list.map((x) => {
          const p = x.pool;
          const posPnl = x.valueUsd + x.unclaimedFeesUsd - x.depositedUsd;
          const il = x.entryPriceQuote > 0 ? impermanentLossPct(p.priceQuote / x.entryPriceQuote) : 0;
          return (
            <div className="prow" key={x.id}>
              <div>
                <div className="pair">
                  <PairAvatar base={p.base} quote={p.quote} size={32} />
                  <div>
                    <b>
                      {p.base.symbol}/{p.quote.symbol}
                    </b>
                    <small>{t.dash.poolSub(venueInfo(p.venue).label, feePct(p.feeBps))}</small>
                  </div>
                </div>
              </div>
              <div>
                {pct(x.share * 100)}
                <small>{t.dash.ofPool}</small>
              </div>
              <div>
                <Fmt>{usd(x.valueUsd)}</Fmt>
                <small>
                  {amt(x.baseAmount)} {p.base.symbol}
                </small>
                <small className={posPnl >= 0 ? 'up' : 'down'}>{t.dash.sinceDeposit(signedUsd(posPnl))}</small>
                {il < -0.01 && <small>{t.dash.il(signed(il))}</small>}
              </div>
              <div className="up">
                <Fmt>{usd(x.unclaimedFeesUsd)}</Fmt>
                <small suppressHydrationWarning>{lockNote(x, t, locale)}</small>
              </div>
              <div className="acts">
                <Button onClick={() => claim(x)} disabled={!(x.unclaimedFeesUsd > 0) || busy === 'c' + x.id}>
                  {t.dash.claim}
                </Button>
                <ButtonLink variant="glass" href={poolHref(p.address, 'add')} scroll={false}>
                  {t.dash.manage}
                </ButtonLink>
                {x.lock.status === 'UNLOCKED' && (
                  <Button variant="glass" onClick={() => setWithdrawing(x)}>
                    {t.dash.withdraw}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <Activity />
      <WithdrawDialog x={withdrawing} onClose={() => setWithdrawing(null)} onDone={withdraw} />
    </>
  );
}
