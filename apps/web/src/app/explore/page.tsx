import type { Metadata } from 'next';
import { Hydrate } from '@/lib/api/Hydrate';
import { ExploreView } from '@/components/explore/ExploreView';
import { DEFAULT_EXPLORE, exploreQuery } from '@/lib/api/presets';
import { PageHeader } from '@/components/ui/PageHeader';
import { Prefetch } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Explore' };

export default async function ExplorePage() {
  const pf = new Prefetch();
  await pf.poolsInfinite(exploreQuery(DEFAULT_EXPLORE));
  return (
    <Hydrate state={pf.state()}>
      <section className="view">
        <div className="wrap">
          <PageHeader eyebrow="Explore" title="Every stock-paired market">
            Search pools, filter by what they&apos;re paired with, and check who holds the liquidity before you trade.
          </PageHeader>
          <ExploreView />
        </div>
      </section>
    </Hydrate>
  );
}
