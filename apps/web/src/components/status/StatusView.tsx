'use client';

import type { HealthState } from '@oxbow/shared';
import { useT } from '@/i18n/client';
import { relTimeL } from '@/i18n/format';
import { useStatus } from '@/lib/api/queries';
import { useNow } from '@/lib/hooks';
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

/** /status: API, RPC, the wallet tracker and swaps. */
export function StatusView() {
  const t = useT();
  const now = useNow(5_000);
  const { data: s } = useStatus();
  const tr = s?.tracker;
  return (
    <div className="card status">
      <div className="hd">
        <h2>{t.status.title}</h2>
        <span className="lnk" suppressHydrationWarning>
          {s ? t.status.checked(relTimeL(Date.parse(s.checkedAt), t, now)) : t.common.loading}
        </span>
      </div>
      {s && tr && (
        <>
          <Row name={t.status.api} state={s.api} />
          <Row name={t.status.rpc} state={s.rpc.state} detail={s.rpc.latencyMs != null ? `${s.rpc.latencyMs} ms` : null} />
          <Row
            name={t.status.tracker}
            state={tr.state}
            detail={[t.status.wallets(tr.wallets), tr.lagSec !== null ? t.status.lag(tr.lagSec) : null, tr.lagSec !== null ? (tr.live ? t.status.live : t.status.catchUp) : null].filter(Boolean).join(' · ')}
          />
          <Row name={t.status.swaps} state={s.swaps} />
          {s.lastTradeAt && (
            <div className="srow">
              <span className="sname muted" suppressHydrationWarning>
                {t.status.lastTrade(relTimeL(Date.parse(s.lastTradeAt), t, now))}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
