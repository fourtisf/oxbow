'use client';

import Link from 'next/link';
import { signed, usd, type HotToken } from '@oxbow/shared';
import { useT } from '@/i18n/client';
import { useHot } from '@/lib/api/queries';
import { tokenHref } from '@/lib/links';
import { TokenAvatar } from '../ui/TokenAvatar';
import { Fmt } from '../ui/primitives';

function Item({ h, dup }: { h: HotToken; dup?: boolean }) {
  const t = useT();
  return (
    <Link className="tk" href={tokenHref(h.token.mint)} tabIndex={dup ? -1 : undefined} aria-hidden={dup || undefined}>
      <TokenAvatar asset={h.token} size={22} eager />
      <b>{h.token.symbol}</b>
      {h.usdPrice !== null && (
        <span>
          <Fmt>{usd(h.usdPrice)}</Fmt>
        </span>
      )}
      {h.change24h !== null && <span className={h.change24h >= 0 ? 'up' : 'down'}>{signed(h.change24h)}</span>}
      <span className="muted">{t.hot.buyers(h.buyers)}</span>
    </Link>
  );
}

/** Top marquee of hot tokens. The second copy only exists for the seamless loop. */
export function Ticker() {
  const { data = [] } = useHot();
  const t = useT();
  if (data.length < 3) return null;
  return (
    <div className="ticker" role="marquee" aria-label={t.nav.hotTicker}>
      <div className="track">
        {data.map((h) => (
          <Item key={'a' + h.token.mint} h={h} />
        ))}
        {data.map((h) => (
          <Item key={'b' + h.token.mint} h={h} dup />
        ))}
      </div>
    </div>
  );
}
