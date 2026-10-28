'use client';

import type { CSSProperties } from 'react';
import { amt, feePct, usd, venueInfo } from '@oxbow/shared';
import { useWallet } from '@/lib/store/wallet';
import { PairAvatar } from '../ui/TokenAvatar';
import { BracketCorners, Button, Fmt, LpBadge } from '../ui/primitives';
import type { CreateModel } from './model';

const UNKNOWN = { symbol: '?', brand: null, logoUri: null };

/** Sticky "Pool preview" card beside the create steps. */
export function PoolPreview({ m, onCreate, busy }: { m: CreateModel; onCreate: () => void; busy: boolean }) {
  const wallet = useWallet((s) => s.wallet);
  const { token: t, quote: q } = m;
  const sym = t?.symbol ?? 'TOKEN';
  const filled = m.b > 0 && m.qa > 0;
  const tube = (has: boolean) => ({ '--h': filled ? '50%' : has ? '26%' : '4%' }) as CSSProperties;
  const c = m.costs;
  return (
    <aside className="preview" aria-label="Pool preview">
      <div className="card pv">
        <BracketCorners />
        <div className="label">Pool preview</div>
        <div className="pv-top">
          {/* The prototype wraps this in an inline span; keeping it keeps the line box (and layout) identical. */}
          <span>
            <PairAvatar base={t ?? UNKNOWN} quote={q} size={40} />
          </span>
          <div>
            <b>
              {sym}/{q ? q.symbol : '?'}
            </b>
            <small>
              {venueInfo(m.form.venue).label}, {feePct(m.form.feeBps)} fee
            </small>
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
            {q ? q.symbol : 'Pair asset'}
            <b>{m.qa > 0 ? <Fmt>{amt(m.qa)}</Fmt> : '—'}</b>
          </span>
        </div>
        <dl className="pv-dl">
          <div>
            <dt>Starting price</dt>
            <dd>{m.priceQ ? <Fmt>{usd(m.priceU)}</Fmt> : '—'}</dd>
          </div>
          <div>
            <dt>Starting market cap</dt>
            <dd>{m.priceQ ? <Fmt>{usd(m.mcap)}</Fmt> : '—'}</dd>
          </div>
          <div>
            <dt>Liquidity</dt>
            <dd>{m.liq ? <Fmt>{usd(m.liq)}</Fmt> : '—'}</dd>
          </div>
          <div>
            <dt>Liquidity status</dt>
            <dd>
              <LpBadge lp={m.lp} />
            </dd>
          </div>
        </dl>
        <div className="costs">
          <div>
            <span>Network rent</span>
            <b>{c.rent} SOL</b>
          </div>
          <div>
            <span>{c.venueLabel} setup</span>
            <b>{c.setup} SOL</b>
          </div>
          <div>
            <span>Oxbow fee</span>
            <b>{c.fee} SOL</b>
          </div>
          <div className="total">
            <span>You pay, plus your deposit</span>
            <b>{c.total} SOL</b>
          </div>
        </div>
        {wallet ? (
          <Button size="lg" block onClick={onCreate} disabled={!!m.msg || busy}>
            Create pool
          </Button>
        ) : (
          <Button size="lg" block onClick={() => useWallet.getState().open()}>
            Select wallet to create
          </Button>
        )}
        <p className="pv-hint" aria-live="polite">
          {m.msg}
        </p>
      </div>
    </aside>
  );
}
