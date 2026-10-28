import type { Metadata } from 'next';
import { FEE_TIERS, feePct, NETWORK_RENT_SOL, usMarketState, VENUES } from '@oxbow/shared';
import { DocsLegend, DocsMarketNow } from '@/components/docs/DocsLegend';
import { IlCalculator } from '@/components/docs/IlCalculator';
import { PricingDemo } from '@/components/docs/PricingDemo';
import { PageHeader } from '@/components/ui/PageHeader';
import { getT } from '@/i18n/server';
import { oxbowFeeSol } from '@/lib/env';

export function generateMetadata(): Metadata {
  return { title: getT().meta.docs };
}

const TOC = ['overview', 'pricing', 'labels', 'risks', 'hours', 'safety', 'fees', 'faq'] as const;

export default function DocsPage() {
  const t = getT();
  const minFee = feePct(Math.min(...FEE_TIERS.map((f) => f.feeBps)));
  const maxFee = feePct(Math.max(...FEE_TIERS.map((f) => f.feeBps)));
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
            <section className="card" id="d-pricing">
              <div className="label">{t.docs.toc.pricing}</div>
              <h2>{t.docs.pricingH}</h2>
              <p>{t.docs.pricing1}</p>
              <PricingDemo />
            </section>
            <section className="card" id="d-labels">
              <div className="label">{t.docs.toc.labels}</div>
              <h2>{t.docs.labelsH}</h2>
              <p>{t.docs.labels1}</p>
              <DocsLegend />
            </section>
            <section className="card" id="d-risks">
              <div className="label">{t.docs.toc.risks}</div>
              <h2>{t.docs.risksH}</h2>
              <p>{t.docs.risks1}</p>
              <p>{t.docs.risks2}</p>
              <IlCalculator />
            </section>
            <section className="card" id="d-hours">
              <div className="label">{t.docs.toc.hours}</div>
              <h2>{t.docs.hoursH}</h2>
              <p>{t.docs.hours1}</p>
              <p>{t.docs.hours2}</p>
              <DocsMarketNow market={usMarketState()} />
            </section>
            <section className="card" id="d-safety">
              <div className="label">{t.docs.toc.safety}</div>
              <h2>{t.docs.safetyH}</h2>
              <p>{t.docs.safety1}</p>
              <p>{t.docs.safety2}</p>
            </section>
            <section className="card" id="d-fees">
              <div className="label">{t.docs.toc.fees}</div>
              <h2>{t.docs.feesH}</h2>
              <p>{t.docs.fees1}</p>
              <table className="ftable">
                <thead>
                  <tr>
                    <th>{t.docs.feeItem}</th>
                    <th>{t.docs.feeCost}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{t.create.rent}</td>
                    <td>{NETWORK_RENT_SOL} SOL</td>
                  </tr>
                  {VENUES.map((v) => (
                    <tr key={v.id}>
                      <td>{t.create.setupCost(v.label)}</td>
                      <td>{v.setupSol} SOL</td>
                    </tr>
                  ))}
                  <tr>
                    <td>{t.create.oxbowFee}</td>
                    <td>{oxbowFeeSol} SOL</td>
                  </tr>
                  <tr>
                    <td>{t.docs.feePerSwap}</td>
                    <td>{t.docs.feeRange(minFee, maxFee)}</td>
                  </tr>
                </tbody>
              </table>
            </section>
            <section className="card" id="d-faq">
              <div className="label">{t.docs.toc.faq}</div>
              <h2>{t.docs.faqH}</h2>
              {t.docs.faq.map(([q, a]) => (
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
