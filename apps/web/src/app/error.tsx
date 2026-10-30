'use client';

import { useEffect } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button, ButtonLink } from '@/components/ui/primitives';
import { useT } from '@/i18n/client';
import { reportError } from '@/lib/monitoring';

/** Route-level error boundary: reports the error and offers a retry. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  useEffect(() => {
    reportError(error, { digest: error.digest });
  }, [error]);
  return (
    <section className="view">
      <div className="wrap">
        <PageHeader eyebrow="Error" title={t.errors.title}>
          {t.errors.body}
        </PageHeader>
        <div className="cta" style={{ marginTop: 0 }}>
          <Button onClick={reset}>{t.errors.retry}</Button>
          <ButtonLink variant="glass" href="/">
            {t.errors.home}
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
