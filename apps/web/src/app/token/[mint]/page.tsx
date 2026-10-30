import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isAddress } from '@oxbow/shared';
import { TokenView } from '@/components/token/TokenView';
import { getT } from '@/i18n/server';
import { api } from '@/lib/api';
import { Hydrate } from '@/lib/api/Hydrate';
import { Prefetch } from '@/lib/api/server';

export async function generateMetadata({ params }: { params: { mint: string } }): Promise<Metadata> {
  const t = getT();
  if (!isAddress(params.mint)) return {};
  const tok = await api.token(params.mint).catch(() => null);
  if (!tok) return { title: t.token.notFound };
  return { title: `${tok.symbol}${tok.name ? ` (${tok.name})` : ''}`, description: t.meta.description };
}

export default async function TokenPage({ params }: { params: { mint: string } }) {
  if (!isAddress(params.mint)) notFound();
  const pf = new Prefetch();
  await Promise.all([pf.token(params.mint), pf.feed({ limit: 40, mint: params.mint })]);
  return (
    <Hydrate state={pf.state()}>
      <section className="view">
        <div className="wrap wpage">
          <TokenView mint={params.mint} />
        </div>
      </section>
    </Hydrate>
  );
}
