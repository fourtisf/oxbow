'use client';

import { amt, usd, type FeedTrade } from '@oxbow/shared';
import { useT } from '@/i18n/client';
import { relTimeL } from '@/i18n/format';
import { track } from '@/lib/analytics';
import { links } from '@/lib/links';
import { useWalletName } from '@/lib/store/follow';
import { useTrade } from '@/lib/store/trade';
import { ExternalIcon } from '../ui/Icons';
import { cx, Fmt } from '../ui/primitives';
import { TokenTag } from '../ui/TokenTag';
import { WalletTag } from '../ui/WalletTag';

/** One buy or sell: who, what, how much, when, and a one-tap copy. */
export function TradeRow({ trade, now, fresh, hideWallet }: { trade: FeedTrade; now: number; fresh?: boolean; hideWallet?: boolean }) {
  const t = useT();
  const open = useTrade((s) => s.open);
  const name = useWalletName(trade.wallet, trade.walletLabel);
  const buy = trade.side === 'BUY';
  return (
    <li className={cx('trow', fresh && 'fresh')}>
      <span className={cx('tside', buy ? 'buy' : 'sell')}>{buy ? 'BUY' : 'SELL'}</span>
      <div className="tmain">
        <div className="tline">
          {!hideWallet && <WalletTag address={trade.wallet} label={trade.walletLabel} featured={trade.featured} smart={trade.smart} size={22} />}
          <span className="muted">{buy ? t.feed.bought : t.feed.sold}</span>
          <span className="tamt mono">
            <Fmt>{amt(trade.amount)}</Fmt>
          </span>
          <TokenTag token={trade.token} size={20} />
        </div>
        <div className="tsub">
          <span className="mono">
            {t.feed.for} <Fmt>{amt(trade.quoteAmount)}</Fmt> {trade.quoteSymbol}
          </span>
          <span className="dotsep" aria-hidden="true">
            ·
          </span>
          <span suppressHydrationWarning>{relTimeL(Date.parse(trade.ts), t, now)}</span>
          <a className="txl" href={links.tx(trade.signature)} target="_blank" rel="noopener noreferrer" aria-label={t.feed.tx}>
            <ExternalIcon />
          </a>
        </div>
      </div>
      <span className={cx('tusd mono', buy ? 'up' : 'down')}>
        <Fmt>{usd(trade.usd)}</Fmt>
      </span>
      <button
        type="button"
        className={cx('btn btn-sm', buy ? 'btn-pri' : 'btn-glass', 'tcopy')}
        aria-label={buy ? t.feed.copyAria(trade.token.symbol) : t.feed.sellAria(trade.token.symbol)}
        onClick={() => {
          open({ token: trade.token, side: trade.side, from: { address: trade.wallet, name } });
          track('trade_opened', { side: trade.side, from: 'feed' });
        }}
      >
        {buy ? t.feed.copy : t.trade.sell}
      </button>
    </li>
  );
}
