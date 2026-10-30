import { PageHeader } from '@/components/ui/PageHeader';
import { ButtonLink } from '@/components/ui/primitives';
import { getT } from '@/i18n/server';

export default function NotFound() {
  const t = getT();
  return (
    <section className="view">
      <div className="wrap">
        <PageHeader eyebrow={t.errors.notFoundEyebrow} title={t.errors.notFoundTitle}>
          {t.errors.notFoundBody}
        </PageHeader>
        <div className="cta" style={{ marginTop: 0 }}>
          <ButtonLink href="/">{t.errors.backToFeed}</ButtonLink>
          <ButtonLink variant="glass" href="/wallets">
            {t.errors.browseWallets}
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
