import type { ReactNode } from 'react';
import { getLocale, getT } from '@/i18n/server';
import { fmtDateL } from '@/i18n/format';
import { legal } from '@/lib/legal';
import { WarnIcon } from '../ui/Icons';
import { PageHeader } from '../ui/PageHeader';

export interface LegalSection {
  h: string;
  body: ReactNode[];
}

/** Shared layout for Terms, Privacy and Risk disclosure (English text, drafts until reviewed). */
export function LegalPage({ eyebrow, title, lede, sections }: { eyebrow: string; title: string; lede: string; sections: LegalSection[] }) {
  const t = getT();
  const locale = getLocale();
  return (
    <section className="view">
      <div className="wrap">
        <PageHeader eyebrow={eyebrow} title={title}>
          {lede}
        </PageHeader>
        <article className="card legal" lang="en">
          <div className="note mid" lang={locale}>
            <WarnIcon />
            <span>{t.legal.draft}</span>
          </div>
          <p className="fine" lang={locale}>
            {t.legal.updated(fmtDateL(legal.updated, locale))}
          </p>
          {sections.map((s, i) => (
            <section key={i}>
              <h2>
                {i + 1}. {s.h}
              </h2>
              {s.body.map((b, j) => (
                <p key={j}>{b}</p>
              ))}
            </section>
          ))}
        </article>
      </div>
    </section>
  );
}
