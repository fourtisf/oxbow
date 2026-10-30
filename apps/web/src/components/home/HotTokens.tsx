'use client';

import Link from 'next/link';
import { usd } from '@oxbow/shared';
import { useT } from '@/i18n/client';
import { useHot } from '@/lib/api/queries';
import { tokenHref } from '@/lib/links';
import { useTrade } from '@/lib/store/trade';
import { ChangePill } from '../ui/badges';
import { FlameIcon } from '../ui/Icons';
import { Fmt } from '../ui/primitives';
import { TokenAvatar } from '../ui/TokenAvatar';

/** Tokens the most tracked wallets bought in the last 24 hours. */
export function HotTokens({ limit = 8 }: { limit?: number }) {
  const t = useT();
  const { data = [], isLoading } = useHot();
  const open = useTrade((s) => s.open);
  return (
    <section className="card" aria-labelledby="hot-h">
      <div className="hd">
        <h2 id="hot-h">
          <span className="ic">
            <FlameIcon />
          </span>
          {t.hot.title}
        </h2>
      </div>
      <p className="hd-sub">{t.hot.sub}</p>
      {data.length ? (
        <ol className="hotlist">
          {data.slice(0, limit).map((h, i) => (
            <li key={h.token.mint}>
              <span className="rank mono">{i + 1}</span>
              <Link className="hot-tok" href={tokenHref(h.token.mint)}>
                <TokenAvatar asset={h.token} size={30} />
                <span>
                  <b>{h.token.symbol}</b>
                  <small className="muted">{t.hot.buyers(h.buyers)}</small>
                </span>
              </Link>
              <span className="hot-num">
                <span className="mono up">
                  <Fmt>{usd(h.buyUsd)}</Fmt>
                </span>
                {h.change24h !== null && <ChangePill value={h.change24h} />}
              </span>
              <button type="button" className="btn btn-pri btn-sm" onClick={() => open({ token: h.token, side: 'BUY' })}>
                {t.token.buy}
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="feed-empty">{isLoading ? <span className="spin" /> : t.hot.empty}</p>
      )}
    </section>
  );
}
