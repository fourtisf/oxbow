import type { PoolSort, QuoteFilter } from '@oxbow/shared';

/** Query presets shared by server prefetching and client hooks (keys must match exactly). */

/** Home "Top markets": eight pools by 24h volume. */
export const TOP_QUERY = { sort: 'vol', limit: 8 } as const;

export const EXPLORE_PAGE_SIZE = 25;

export interface ExploreFilterValues {
  q: string;
  quote: QuoteFilter;
  locked: boolean;
  sort: PoolSort;
}

export const DEFAULT_EXPLORE: ExploreFilterValues = { q: '', quote: 'all', locked: false, sort: 'vol' };

export const exploreQuery = (f: ExploreFilterValues) => ({
  q: f.q.trim() || undefined,
  quote: f.quote,
  locked: f.locked,
  sort: f.sort,
  limit: EXPLORE_PAGE_SIZE,
});
