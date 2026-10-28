'use client';

import Link from 'next/link';
import { BackIcon } from '../ui/Icons';
import { Card } from '../ui/primitives';
import { PoolView } from './PoolBody';
import type { TradeTab } from './TradePanel';

/** Full-page pool view for direct visits to /pool/[address]. Same content as the drawer. */
export function PoolPage({ address, tab }: { address: string; tab: TradeTab }) {
  return (
    <section className="view">
      <div className="wrap">
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <Link className="poolback" href="/explore">
            <BackIcon />
            All markets
          </Link>
          <Card corners className="poolpage">
            <PoolView address={address} tab={tab} />
          </Card>
        </div>
      </div>
    </section>
  );
}
