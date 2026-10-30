import type { Metadata } from 'next';
import type { SafetyFlag } from '@oxbow/shared';
import { PageHeader } from '@/components/ui/PageHeader';
import { getT } from '@/i18n/server';

export function generateMetadata(): Metadata {
  return { title: getT().meta.docs };
}

const TOC = ['overview', 'smart', 'copy', 'limit', 'flow', 'fees', 'pnl', 'safety', 'risks', 'faq'] as const;
const FLAGS: SafetyFlag[] = ['MINTABLE', 'FREEZABLE', 'LOW_LIQUIDITY', 'CONCENTRATED', 'DEV_HOLDS_MUCH', 'NEW_TOKEN', 'LOW_ORGANIC', 'UNVERIFIED'];
/** The fee the API charges by default (OXBOW_FEE_BPS); shown in the docs as a percentage. */
const FEE_PCT = `${(Number(process.env.NEXT_PUBLIC_OXBOW_FEE_BPS) || 50) / 100}%`;

export default function DocsPage() {
  const t = getT();
  return (
    <section className="view">
      <div className="wrap">
        <PageHeader eyebrow={t.docs.eyebrow} title={t.docs.title}>
          {t.docs.lede}
        </PageHeader>
        <div className="docs">
          <nav className="card toc" aria-label={t.docs.sections}>
            {TOC.map((id) => (
              <a key={id} href={'#d-' + id}>
                {t.docs.toc[id]}
              </a>
            ))}
          </nav>
          <div className="doc">
            <section className="card" id="d-overview">
              <div className="label">{t.docs.toc.overview}</div>
              <h2>{t.docs.overviewH}</h2>
              <p>{t.docs.overview1}</p>
              <p>{t.docs.overview2}</p>
            </section>
            <section className="card" id="d-smart">
              <div className="label">{t.docs.toc.smart}</div>
              <h2>{t.docs.smartH}</h2>
              <p>{t.docs.smart1}</p>
              <p>{t.docs.smart2}</p>
            </section>
            <section className="card" id="d-copy">
              <div className="label">{t.docs.toc.copy}</div>
              <h2>{t.docs.copyH}</h2>
              <p>{t.docs.copy1}</p>
              <p>{t.docs.copy2}</p>
            </section>
            <section className="card" id="d-limit">
              <div className="label">{t.docs.toc.limit}</div>
              <h2>{t.docs.limitH}</h2>
              <p>{t.docs.limit1}</p>
            </section>
            <section className="card" id="d-flow">
              <div className="label">{t.docs.toc.flow}</div>
              <h2>{t.docs.flowH}</h2>
              <p>{t.docs.flow1}</p>
            </section>
            <section className="card" id="d-fees">
              <div className="label">{t.docs.toc.fees}</div>
              <h2>{t.docs.feesH}</h2>
              <p>{t.docs.fees1}</p>
              <p>{t.docs.fees2(FEE_PCT)}</p>
              <p>{t.docs.fees3}</p>
            </section>
            <section className="card" id="d-pnl">
              <div className="label">{t.docs.toc.pnl}</div>
              <h2>{t.docs.pnlH}</h2>
              <p>{t.docs.pnl1}</p>
              <p>{t.docs.pnl2}</p>
              <p>{t.docs.pnl3}</p>
            </section>
            <section className="card" id="d-safety">
              <div className="label">{t.docs.toc.safety}</div>
              <h2>{t.docs.safetyH}</h2>
              <p>{t.docs.safety1}</p>
              <ul className="flags docflags">
                {FLAGS.map((f) => (
                  <li key={f} className={f === 'MINTABLE' || f === 'FREEZABLE' ? 'danger' : 'caution'}>
                    <b className="mono">{f.replace(/_/g, ' ')}</b> {t.token.flags[f]}
                  </li>
                ))}
              </ul>
            </section>
            <section className="card" id="d-risks">
              <div className="label">{t.docs.toc.risks}</div>
              <h2>{t.docs.risksH}</h2>
              <p>{t.docs.risks1}</p>
              <p>{t.docs.risks2}</p>
            </section>
            <section className="card" id="d-faq">
              <div className="label">{t.docs.toc.faq}</div>
              <h2>{t.docs.faqH}</h2>
              {t.docs.faq.map(({ q, a }) => (
                <details key={q}>
                  <summary>{q}</summary>
                  <p>{a}</p>
                </details>
              ))}
            </section>
          </div>
        </div>
      </div>
    </section>
  );
}
