'use client';

import Link from 'next/link';
import { useT } from '@/i18n/client';
import { BackIcon } from '../ui/Icons';
import { Card } from '../ui/primitives';
import { PoolView } from './PoolBody';
import type { TradeTab } from './TradePanel';

/** Full-page pool view for direct visits to /pool/[address]. Same content as the drawer. */
export function PoolPage({ address, tab }: { address: string; tab: TradeTab }) {
  const t = useT();
  return (
    <section className="view">
      <div className="wrap">
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <Link className="poolback" href="/explore">
            <BackIcon />
            {t.pool.allMarkets}
          </Link>
          <Card corners className="poolpage">
            <PoolView address={address} tab={tab} />
          </Card>
        </div>
      </div>
    </section>
  );
}
