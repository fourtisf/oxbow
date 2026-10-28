import type { Metadata } from 'next';
import { CreateView } from '@/components/create/CreateView';
import { PageHeader } from '@/components/ui/PageHeader';
import { Hydrate } from '@/lib/api/Hydrate';
import { Prefetch } from '@/lib/api/server';
import { getT } from '@/i18n/server';

export function generateMetadata(): Metadata {
  return { title: getT().meta.create };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.slice(0, 64);

export default async function CreatePage({ searchParams }: { searchParams: { mint?: string | string[]; quote?: string | string[] } }) {
  const t = getT();
  const pf = new Prefetch();
  await pf.quotes();
  return (
    <Hydrate state={pf.state()}>
      <section className="view">
        <div className="wrap">
          <PageHeader eyebrow={t.create.eyebrow} title={t.create.title}>
            {t.create.lede}
          </PageHeader>
          <CreateView initialMint={one(searchParams.mint)} initialQuote={one(searchParams.quote)} />
        </div>
      </section>
    </Hydrate>
  );
}
