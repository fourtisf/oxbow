'use client';

import { signed, usd } from '@oxbow/shared';
import { useT } from '@/i18n/client';
import { useStats } from '@/lib/api/queries';
import { useCountUp } from '@/lib/hooks';
import { BarsIcon, LiquidIcon, TrendIcon } from '../ui/Icons';
import { Sparkline } from '../ui/Sparkline';
import { Fmt } from '../ui/primitives';

const Spark = ({ data, color }: { data: number[]; color: string }) => (
  <div className="sp">
    <Sparkline data={data} W={200} H={56} color={color} op={0.35} sw={1.6} />
  </div>
);

/** Home stat cards: 24h volume, liquidity, top gainer, with the prototype's count-up. */
export function StatCards() {
  const t = useT();
  const { data } = useStats();
  const empty = data?.marketCount === 0;
  const vol = useCountUp('stat-vol', data?.vol24hUsd ?? 0);
  const tvl = useCountUp('stat-tvl', data?.tvlUsd ?? 0);
  const top = data?.topGainer;
  const gain = useCountUp('stat-gain', top?.pool.change24h ?? 0);
  return (
    <div className="stats3">
      <div className="card stat">
        {!empty && <Spark data={data?.sparks.vol ?? []} color="#9ECFFF" />}
        <div className="top">
          <span className="label">{t.home.vol24h}</span>
          <span className="ic">
            <BarsIcon />
          </span>
        </div>
        <div className="val">{empty ? '—' : <Fmt>{usd(vol)}</Fmt>}</div>
        <div className="sub">{data ? (empty ? t.home.noMarkets : t.common.markets(data.marketCount)) : ' '}</div>
      </div>
      <div className="card stat">
        {!empty && <Spark data={data?.sparks.tvl ?? []} color="#9ECFFF" />}
        <div className="top">
          <span className="label">{t.home.liquidity}</span>
          <span className="ic">
            <LiquidIcon />
          </span>
        </div>
        <div className="val">{empty ? '—' : <Fmt>{usd(tvl)}</Fmt>}</div>
        <div className="sub">{t.home.inTracked}</div>
      </div>
      <div className="card stat">
        {top && <Spark data={data?.sparks.gainer ?? []} color="#3DDC97" />}
        <div className="top">
          <span className="label">{t.home.topGainer}</span>
          <span className="ic" style={{ color: 'var(--up)' }}>
            <TrendIcon />
          </span>
        </div>
        <div className={top ? 'val up' : 'val'}>{top ? signed(gain) : '—'}</div>
        <div className="sub mono">{top ? `${top.pool.base.symbol}/${top.pool.quote.symbol}` : ' '}</div>
      </div>
    </div>
  );
}
