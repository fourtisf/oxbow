import type { Metadata } from 'next';
import { PortfolioView } from '@/components/portfolio/PortfolioView';
import { PageHeader } from '@/components/ui/PageHeader';
import { getT } from '@/i18n/server';

export function generateMetadata(): Metadata {
  const t = getT();
  return { title: t.meta.portfolio, robots: { index: false } };
}

export default function PortfolioPage() {
  const t = getT();
  return (
    <section className="view">
      <div className="wrap">
        <PageHeader eyebrow={t.portfolio.eyebrow} title={t.portfolio.title}>
          {t.portfolio.lede}
        </PageHeader>
        <PortfolioView />
      </div>
    </section>
  );
}
