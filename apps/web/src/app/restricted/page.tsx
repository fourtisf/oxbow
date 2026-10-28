import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/PageHeader';
import { ButtonLink } from '@/components/ui/primitives';
import { getT } from '@/i18n/server';

export function generateMetadata(): Metadata {
  return { title: getT().meta.restricted, robots: { index: false } };
}

/** Shown (via middleware rewrite) to visitors from GEO_BLOCKED_COUNTRIES. */
export default function RestrictedPage() {
  const t = getT();
  return (
    <section className="view">
      <div className="wrap">
        <PageHeader eyebrow="Oxbow" title={t.restricted.title}>
          {t.restricted.body}
        </PageHeader>
        <div className="cta" style={{ marginTop: 0 }}>
          <ButtonLink href="/docs">{t.restricted.docs}</ButtonLink>
          <ButtonLink variant="glass" href="/terms">
            {t.restricted.terms}
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
