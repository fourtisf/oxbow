import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/PageHeader';
import { AddWallet } from '@/components/wallets/AddWallet';
import { Leaderboard } from '@/components/wallets/Leaderboard';
import { getT } from '@/i18n/server';
import { Hydrate } from '@/lib/api/Hydrate';
import { Prefetch } from '@/lib/api/server';

export function generateMetadata(): Metadata {
  const t = getT();
  return { title: t.meta.wallets, description: t.wallets.lede };
}

export default async function WalletsPage() {
  const t = getT();
  const pf = new Prefetch();
  await pf.wallets();
  return (
    <Hydrate state={pf.state()}>
      <section className="view">
        <div className="wrap">
          <PageHeader eyebrow={t.wallets.eyebrow} title={t.wallets.title}>
            {t.wallets.lede}
          </PageHeader>
          <section className="card addcard" aria-labelledby="add-h">
            <div>
              <h2 id="add-h">{t.wallets.addTitle}</h2>
              <p className="muted">{t.wallets.addSub}</p>
            </div>
            <AddWallet />
          </section>
          <section className="card">
            <Leaderboard />
          </section>
        </div>
      </section>
    </Hydrate>
  );
}
