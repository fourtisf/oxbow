import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Hydrate } from '@/lib/api/Hydrate';
import { isAddress } from '@oxbow/shared';
import { PoolPage } from '@/components/pool/PoolPage';
import { api } from '@/lib/api';
import { Prefetch } from '@/lib/api/server';

export async function generateMetadata({ params }: { params: { address: string } }): Promise<Metadata> {
  const p = isAddress(params.address) ? await api.pool(params.address) : null;
  return { title: p ? `${p.base.symbol}/${p.quote.symbol}` : 'Pool' };
}

/** Direct visits and shared links to /pool/[address] get a full page. */
export default async function PoolRoute({ params, searchParams }: { params: { address: string }; searchParams: { tab?: string } }) {
  if (!isAddress(params.address) || !(await api.pool(params.address))) notFound();
  const pf = new Prefetch();
  await Promise.all([pf.pool(params.address), pf.chart(params.address, '1D')]);
  return (
    <Hydrate state={pf.state()}>
      <PoolPage address={params.address} tab={searchParams.tab === 'add' ? 'add' : 'swap'} />
    </Hydrate>
  );
}
