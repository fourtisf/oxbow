import type { Metadata } from 'next';
import { Hydrate } from '@/lib/api/Hydrate';
import { ExploreView } from '@/components/explore/ExploreView';
import { DEFAULT_EXPLORE, exploreQuery } from '@/lib/api/presets';
import { PageHeader } from '@/components/ui/PageHeader';
import { Prefetch } from '@/lib/api/server';
import { getT } from '@/i18n/server';

export function generateMetadata(): Metadata {
  return { title: getT().meta.explore };
}

export default async function ExplorePage() {
  const t = getT();
  const pf = new Prefetch();
  await pf.poolsInfinite(exploreQuery(DEFAULT_EXPLORE));
  return (
    <Hydrate state={pf.state()}>
      <section className="view">
        <div className="wrap">
          <PageHeader eyebrow={t.explore.eyebrow} title={t.explore.title}>
            {t.explore.lede}
          </PageHeader>
          <ExploreView />
        </div>
      </section>
    </Hydrate>
  );
}
