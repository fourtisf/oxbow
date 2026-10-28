import type { Metadata } from 'next';
import { StatusView } from '@/components/status/StatusView';
import { PageHeader } from '@/components/ui/PageHeader';
import { getT } from '@/i18n/server';
import { Hydrate } from '@/lib/api/Hydrate';
import { Prefetch } from '@/lib/api/server';

export function generateMetadata(): Metadata {
  return { title: getT().meta.status };
}

export default async function StatusPage() {
  const t = getT();
  const pf = new Prefetch();
  await pf.status();
  return (
    <Hydrate state={pf.state()}>
      <section className="view">
        <div className="wrap">
          <PageHeader eyebrow={t.status.eyebrow} title={t.status.title}>
            {t.status.lede}
          </PageHeader>
          <StatusView />
        </div>
      </section>
    </Hydrate>
  );
}
