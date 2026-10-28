'use client';

import { usMarketState, type HealthState } from '@oxbow/shared';
import { useT } from '@/i18n/client';
import { relTimeL } from '@/i18n/format';
import { useStatus } from '@/lib/api/queries';
import { useNow } from '@/lib/hooks';
import { MarketChip } from '../ui/badges';
import { WarnIcon } from '../ui/Icons';
import { cx } from '../ui/primitives';

function Row({ name, state, detail }: { name: string; state: HealthState; detail?: string | null }) {
  const t = useT();
  return (
    <div className="srow">
      <span className="sname">{name}</span>
      {detail && <span className="sdetail">{detail}</span>}
      <span className={cx('sstate', state.toLowerCase())}>
        <span className="dot" aria-hidden="true" />
        {t.status.state[state]}
      </span>
    </div>
  );
}

/** /status: API, RPC, indexer and price-feed health, plus the US market session. */
export function StatusView() {
  const t = useT();
  const now = useNow(5_000);
  const { data: s } = useStatus();
  return (
    <div className="card status">
      <div className="hd">
        <h2>{t.status.title}</h2>
        <span className="lnk" suppressHydrationWarning>
          {s ? t.status.checked(relTimeL(Date.parse(s.checkedAt), t, now)) : t.common.loading}
        </span>
      </div>
      {s && (
        <>
          <Row name={t.status.api} state={s.api} />
          <Row name={t.status.rpc} state={s.rpc.state} detail={s.rpc.latencyMs != null ? `${s.rpc.latencyMs} ms` : null} />
          <Row name={t.status.indexer} state={s.indexer.state} detail={s.indexer.lagSec ? t.status.lag(s.indexer.lagSec) : null} />
          <Row name={t.status.prices} state={s.prices.state} />
          <div className="srow">
            <span className="sname">{t.status.market}</span>
            <MarketChip market={usMarketState(now)} />
          </div>
          {s.sampleData && (
            <div className="note mid" style={{ margin: 20 }}>
              <WarnIcon />
              <span>{t.status.sample}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
