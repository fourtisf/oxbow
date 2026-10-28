'use client';

import Link from 'next/link';
import { signed, usd, type TickerItem } from '@oxbow/shared';
import { useTicker } from '@/lib/api/queries';
import { TokenAvatar } from '../ui/TokenAvatar';
import { Fmt } from '../ui/primitives';

function Item({ t, dup }: { t: TickerItem; dup?: boolean }) {
  const body = (
    <>
      <TokenAvatar asset={t.asset} size={22} />
      <b>{t.asset.symbol}</b>
      <span>
        <Fmt>{usd(t.priceUsd)}</Fmt>
      </span>
      <span className={t.change24h >= 0 ? 'up' : 'down'}>{signed(t.change24h)}</span>
    </>
  );
  if (t.kind === 'pool' && t.address)
    return (
      <Link className="tk" href={`/pool/${t.address}`} scroll={false} tabIndex={dup ? -1 : undefined} aria-hidden={dup || undefined}>
        {body}
      </Link>
    );
  return (
    <span className="tk" aria-hidden={dup || undefined}>
      {body}
    </span>
  );
}

/** Top marquee (`.ticker`). The second copy only exists for the seamless loop. */
export function Ticker() {
  const { data = [] } = useTicker();
  return (
    <div className="ticker" role="marquee" aria-label="Live prices">
      <div className="track">
        {data.map((t, i) => (
          <Item key={'a' + i} t={t} />
        ))}
        {data.map((t, i) => (
          <Item key={'b' + i} t={t} dup />
        ))}
      </div>
    </div>
  );
}
