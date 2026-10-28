import type { Metadata } from 'next';
import { CreateView } from '@/components/create/CreateView';
import { PageHeader } from '@/components/ui/PageHeader';
import { Hydrate } from '@/lib/api/Hydrate';
import { Prefetch } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Create pool' };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.slice(0, 64);

export default async function CreatePage({ searchParams }: { searchParams: { mint?: string | string[]; quote?: string | string[] } }) {
  const pf = new Prefetch();
  await pf.quotes();
  return (
    <Hydrate state={pf.state()}>
      <section className="view">
        <div className="wrap">
          <PageHeader eyebrow="Create pool" title="Build the pair">
            Pair your token with a stock token, SOL or USDC. You approve one transaction in your wallet.
          </PageHeader>
          <CreateView initialMint={one(searchParams.mint)} initialQuote={one(searchParams.quote)} />
        </div>
      </section>
    </Hydrate>
  );
}
