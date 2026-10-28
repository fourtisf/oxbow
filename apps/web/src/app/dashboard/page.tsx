import type { Metadata } from 'next';
import { Positions } from '@/components/dashboard/Positions';
import { PageHeader } from '@/components/ui/PageHeader';
import { getT } from '@/i18n/server';

export function generateMetadata(): Metadata {
  return { title: getT().meta.dashboard };
}

export default function DashboardPage() {
  const t = getT();
  return (
    <section className="view">
      <div className="wrap">
        <PageHeader eyebrow={t.dash.eyebrow} title={t.dash.title}>
          {t.dash.lede}
        </PageHeader>
        <Positions />
      </div>
    </section>
  );
}
