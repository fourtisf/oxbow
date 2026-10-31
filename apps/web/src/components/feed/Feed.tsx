'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { FeedTrade } from '@oxbow/shared';
import { useT } from '@/i18n/client';
import { useFeed, useStatus } from '@/lib/api/queries';
import { useNow } from '@/lib/hooks';
import { mergeLive, useLive } from '@/lib/live';
import { useFollow } from '@/lib/store/follow';
import { PulseIcon } from '../ui/Icons';
import { Button, cx } from '../ui/primitives';
import { TradeRow } from './TradeRow';

export type FeedScope = 'all' | 'following';
const MIN_USD = [0, 10, 100, 1000, 10_000] as const;

/** Feed defaults the server prefetches for the home page. Dust trades (bots buying cents at a time) are hidden by default. */
export const HOME_FEED = { limit: 40, minUsd: 10 } as const;
const PAGE = { limit: 40 } as const;

/**
 * The live trade feed: the latest page from the API, with trades from the
 * stream added on top as they arrive. `mint` and `wallet` narrow it for token
 * and wallet pages; on the home page the visitor can switch to wallets they follow.
 */
export function Feed({ mint, wallet, scopes = true, initialScope = 'all', title, refreshMs = false }: { mint?: string; wallet?: string; scopes?: boolean; initialScope?: FeedScope; title?: string; refreshMs?: number | false }) {
  const t = useT();
  const now = useNow(10_000);
  const [scope, setScope] = useState<FeedScope>(initialScope);
  const [minUsd, setMinUsd] = useState<number>(!wallet && !mint ? HOME_FEED.minUsd : 0);
  const followed = useFollow((s) => s.list);
  const loaded = useFollow((s) => s.loaded);
  const followList = useMemo(() => followed.map((f) => f.address).sort(), [followed]);

  const wallets = wallet ? [wallet] : scope === 'following' ? followList : undefined;
  const query = { ...PAGE, ...(mint ? { mint } : {}), ...(wallets ? { wallets: wallets.join(',') } : {}), ...(minUsd ? { minUsd } : {}) };
  const waitingForList = scope === 'following' && !wallet && (!loaded || !followList.length);
  const feed = useFeed(query, !waitingForList, refreshMs);
  const live = useLive((s) => s.trades);
  const { data: status } = useStatus();
  const noWallets = status?.tracker.wallets === 0;

  const fetched = useMemo(() => feed.data?.pages.flatMap((p) => p.trades) ?? [], [feed.data]);
  const keep = (x: FeedTrade) => (!mint || x.token.mint === mint) && (!wallets || wallets.includes(x.wallet)) && x.usd >= minUsd;
  const trades = waitingForList ? [] : mergeLive(live, fetched, keep);
  const freshIds = new Set(live.slice(0, 20).map((x) => x.id));

  return (
    <section className="card feedcard" aria-labelledby="feed-h">
      <div className="hd">
        <h2 id="feed-h">
          <span className="ic">
            <PulseIcon />
          </span>
          {title ?? t.feed.title}
          <span className="live" aria-hidden="true" />
        </h2>
        <div className="feedctl">
          {scopes && !wallet && !mint && (
            <div className="seg" role="group" aria-label={t.feed.filter}>
              <button type="button" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>
                {t.feed.all}
              </button>
              <button type="button" aria-pressed={scope === 'following'} onClick={() => setScope('following')}>
                {t.feed.following}
                {followList.length > 0 && <span className="cnt">{followList.length}</span>}
              </button>
            </div>
          )}
          <label className="minusd">
            <span className="sr-only">{t.feed.minUsd}</span>
            <select className="select sm" value={minUsd} onChange={(e) => setMinUsd(Number(e.target.value))} aria-label={t.feed.minUsd}>
              {MIN_USD.map((v) => (
                <option key={v} value={v}>
                  {v ? `≥ $${v.toLocaleString('en-US')}` : `${t.feed.minUsd}: ${t.feed.any}`}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {trades.length > 0 ? (
        <ul className="tlist" aria-live="polite" aria-relevant="additions">
          {trades.map((x) => (
            <TradeRow key={x.id} trade={x} now={now} fresh={freshIds.has(x.id)} hideWallet={!!wallet} />
          ))}
        </ul>
      ) : feed.isLoading && !waitingForList ? (
        <div className="feed-empty">
          <span className="spin" /> {t.common.loading}
        </div>
      ) : (
        <div className={cx('feed-empty', (scope === 'following' || noWallets) && 'big')}>
          {scope === 'all' && !wallet && !mint && noWallets ? (
            <>
              <p className="finding">
                <span className="spin" /> <b>{t.feed.finding}</b>
              </p>
              <p>{t.feed.findingBody}</p>
              {status && (
                <p className="mono finding-stats">
                  {t.feed.findingProgress(status.discovery.checked, status.discovery.found)} ·{' '}
                  {status.discovery.running ? t.feed.findingNow : status.discovery.paused ? t.feed.findingPaused : t.feed.findingNext}
                </p>
              )}
            </>
          ) : (
            <p>
              {scope === 'following' && !wallet && !followList.length ? t.feed.emptyFollowing : minUsd ? `${t.feed.emptyFiltered} ${t.feed.emptyFilteredHint}` : t.feed.empty}
            </p>
          )}
          {scope === 'following' && !wallet && !followList.length && (
            <Link className="btn btn-glass btn-sm" href="/wallets">
              {t.feed.browseWallets}
            </Link>
          )}
        </div>
      )}

      {feed.hasNextPage && trades.length > 0 && (
        <div className="more">
          <Button variant="glass" size="sm" onClick={() => feed.fetchNextPage()} disabled={feed.isFetchingNextPage}>
            {feed.isFetchingNextPage ? <span className="spin" /> : t.feed.loadMore}
          </Button>
        </div>
      )}
    </section>
  );
}
