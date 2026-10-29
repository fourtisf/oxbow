'use client';

import type { CSSProperties } from 'react';
import { amt, feePct, usd, venueInfo } from '@oxbow/shared';
import { useLocale, useT } from '@/i18n/client';
import { marketWhen } from '@/i18n/format';
import { useWallet } from '@/lib/store/wallet';
import { LpBadge } from '../ui/badges';
import { HalfIcon } from '../ui/Icons';
import { PairAvatar } from '../ui/TokenAvatar';
import { BracketCorners, Button, Fmt } from '../ui/primitives';
import type { CreateModel } from './model';


/** Sticky "Pool preview" card beside the create steps. */
export function PoolPreview({ m, onCreate, busy }: { m: CreateModel; onCreate: () => void; busy: boolean }) {
  const t = useT();
  const locale = useLocale();
  const wallet = useWallet((s) => s.wallet);
  const { token: tk, quote: q } = m;
  const sym = tk?.symbol ?? 'TOKEN';
  const filled = m.b > 0 && m.qa > 0;
  const tube = (has: boolean) => ({ '--h': filled ? '50%' : has ? '26%' : '4%' }) as CSSProperties;
  const c = m.costs;
  return (
    <aside className="preview" aria-label={t.create.preview}>
      <div className="card pv">
        <BracketCorners />
        <div className="label">{t.create.preview}</div>
        <div className="pv-top">
          {/* The prototype wraps this in an inline span; keeping it keeps the line box (and layout) identical. */}
          <span>
            <PairAvatar base={tk ?? null} quote={q} size={40} />
          </span>
          <div>
            <b>
              {sym}/{q ? q.symbol : '?'}
            </b>
            <small>{t.create.pvSub(venueInfo(m.form.venue).label, feePct(m.form.feeBps))}</small>
          </div>
        </div>
        <div className="pv-mini" aria-hidden="true">
          <div className="tube l">
            <i style={tube(m.b > 0)} />
          </div>
          <div className="tube r">
            <i style={tube(m.qa > 0)} />
          </div>
        </div>
        <div className="tube-l">
          <span>
            {sym}
            <b>{m.b > 0 ? <Fmt>{amt(m.b)}</Fmt> : '—'}</b>
          </span>
          <span>
            {q ? q.symbol : t.create.pairAsset}
            <b>{m.qa > 0 ? <Fmt>{amt(m.qa)}</Fmt> : '—'}</b>
          </span>
        </div>
        <dl className="pv-dl">
          <div>
            <dt>{t.create.startPrice}</dt>
            <dd>{m.priceQ ? <Fmt>{usd(m.priceU)}</Fmt> : '—'}</dd>
          </div>
          <div>
            <dt>{t.create.startMcapLong}</dt>
            <dd>{m.priceQ ? <Fmt>{usd(m.mcap)}</Fmt> : '—'}</dd>
          </div>
          <div>
            <dt>{t.create.liquidity}</dt>
            <dd>{m.liq ? <Fmt>{usd(m.liq)}</Fmt> : '—'}</dd>
          </div>
          <div>
            <dt>{t.create.status}</dt>
            <dd>
              <LpBadge lp={m.lp} />
            </dd>
          </div>
        </dl>
        {q?.market?.status === 'CLOSED' && (
          <div className="note mid pv-note" suppressHydrationWarning>
            <HalfIcon />
            <span>{t.create.closedWarn(q.name, marketWhen(q.market.nextChange, locale))}</span>
          </div>
        )}
        <div className="costs">
          <div>
            <span>{t.create.rent}</span>
            <b>{c.rent} SOL</b>
          </div>
          <div>
            <span>{t.create.setupCost(c.venueLabel)}</span>
            <b>{c.setup} SOL</b>
          </div>
          <div>
            <span>{t.create.oxbowFee}</span>
            <b>{c.fee} SOL</b>
          </div>
          <div className="total">
            <span>{t.create.total}</span>
            <b>{c.total} SOL</b>
          </div>
        </div>
        {wallet ? (
          <Button size="lg" block onClick={onCreate} disabled={!!m.msg || busy}>
            {t.create.createBtn}
          </Button>
        ) : (
          <Button size="lg" block onClick={() => useWallet.getState().open()}>
            {t.create.selectToCreate}
          </Button>
        )}
        <p className="pv-hint" aria-live="polite">
          {m.msg}
        </p>
      </div>
    </aside>
  );
}
