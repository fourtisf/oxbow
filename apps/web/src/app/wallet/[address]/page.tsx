import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isAddress, shortAddr } from '@oxbow/shared';
import { WalletView } from '@/components/wallet/WalletView';
import { getT } from '@/i18n/server';
import { Hydrate } from '@/lib/api/Hydrate';
import { Prefetch } from '@/lib/api/server';
import { api } from '@/lib/api';

export async function generateMetadata({ params }: { params: { address: string } }): Promise<Metadata> {
  const t = getT();
  if (!isAddress(params.address)) return {};
  const w = await api.wallet(params.address).catch(() => null);
  const name = w?.label ?? shortAddr(params.address);
  return { title: t.walletPage.title(name), description: t.meta.description, robots: w?.featured ? undefined : { index: false } };
}

export default async function WalletPage({ params }: { params: { address: string } }) {
  if (!isAddress(params.address)) notFound();
  const pf = new Prefetch();
  await Promise.all([pf.wallet(params.address), pf.feed({ limit: 40, wallets: params.address })]);
  return (
    <Hydrate state={pf.state()}>
      <section className="view">
        <div className="wrap wpage">
          <WalletView address={params.address} />
        </div>
      </section>
    </Hydrate>
  );
}
