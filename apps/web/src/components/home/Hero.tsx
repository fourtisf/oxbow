'use client';

import { useT } from '@/i18n/client';
import { useStatus } from '@/lib/api/queries';
import { copyText } from '@/lib/copy';
import { env } from '@/lib/env';
import { CopyIcon } from '../ui/Icons';
import { BracketCorners } from '../ui/primitives';
import { AddWallet } from '../wallets/AddWallet';

export function Hero() {
  const t = useT();
  const { data: s } = useStatus();
  const ca = env.contractAddress;
  return (
    <section className="card hero thero" aria-labelledby="hero-h">
      <BracketCorners />
      <div className="hero-aura" aria-hidden="true" />
      <div className="hero-copy">
        <div className="eyebrow">
          <span className="live" aria-hidden="true" />
          {t.home.eyebrow}
        </div>
        <h1 id="hero-h">
          <span className="l1">{t.home.h1a}</span>
          <span>{t.home.h1b}</span>
        </h1>
        <p className="lede">{t.home.lede}</p>
        <AddWallet big />
        <div className="ca">
          <span className="label">CA</span>
          <span className="mono cav">{ca ?? t.home.caSoon}</span>
          {ca && (
            <button type="button" className="icon-btn" aria-label={t.home.copyCa} onClick={() => copyText(ca)}>
              <CopyIcon />
            </button>
          )}
        </div>
        <dl className="hstats">
          <div>
            <dt>{t.home.statWallets}</dt>
            <dd className="mono">{s ? s.tracker.wallets.toLocaleString('en-US') : '—'}</dd>
          </div>
          <div>
            <dt>{t.home.statLive}</dt>
            <dd>
              <span className={s?.tracker.state === 'OK' ? 'live' : 'live amber'} aria-hidden="true" />
              {s?.tracker.state === 'OK' ? t.home.live : t.home.catchUp}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
