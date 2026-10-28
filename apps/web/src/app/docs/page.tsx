import type { Metadata } from 'next';
import { FEE_TIERS, feePct, NETWORK_RENT_SOL, VENUES } from '@oxbow/shared';
import { PricingDemo } from '@/components/docs/PricingDemo';
import { PageHeader } from '@/components/ui/PageHeader';
import { LpBadge, type LpBadgeInput } from '@/components/ui/primitives';
import { oxbowFeeSol } from '@/lib/env';

export const metadata: Metadata = { title: 'Docs' };

const LEGEND: [LpBadgeInput, string][] = [
  [{ status: 'BURNED', lockedPct: 100 }, 'Liquidity was sent to a dead address. Nobody can ever withdraw it.'],
  [{ status: 'LOCKED', lockedPct: 100, days: 180 }, 'Locked in a time lock. The creator gets it back when the countdown ends.'],
  [{ status: 'PARTIAL', lockedPct: 60 }, 'Only part is locked. The rest can be withdrawn at any time.'],
  [{ status: 'UNLOCKED', lockedPct: 0 }, 'The creator can withdraw everything at any time. Trade with care.'],
];

const TOC = [
  ['d-overview', 'Overview'],
  ['d-pricing', 'Pricing'],
  ['d-labels', 'Liquidity labels'],
  ['d-fees', 'Fees'],
  ['d-faq', 'FAQ'],
] as const;

export default function DocsPage() {
  const minFee = feePct(Math.min(...FEE_TIERS.map((f) => f.feeBps)));
  const maxFee = feePct(Math.max(...FEE_TIERS.map((f) => f.feeBps)));
  return (
    <section className="view">
      <div className="wrap">
        <PageHeader eyebrow="Docs" title="How Oxbow works">
          Everything you need to create, trade and check a stock-paired pool.
        </PageHeader>
        <div className="docs">
          <nav className="card toc" aria-label="Docs sections">
            {TOC.map(([id, l]) => (
              <a key={id} href={'#' + id}>
                {l}
              </a>
            ))}
          </nav>
          <div className="doc">
            <section className="card" id="d-overview">
              <div className="label">Overview</div>
              <h2>A pool for any token, priced in a stock</h2>
              <p>
                Oxbow creates a liquidity pool that pairs a token already on Solana with a tokenized stock, SOL or USDC. Traders buy your token with the pair asset, and the pool sets the price
                automatically from what&apos;s inside it.
              </p>
              <p>
                You don&apos;t launch a new token. You bring an existing mint, choose what to pair it with, deposit both sides and pick whether the liquidity is burned, locked or left unlocked.
              </p>
            </section>
            <section className="card" id="d-pricing">
              <div className="label">Pricing</div>
              <h2>Drag to see a trade move the price</h2>
              <p>
                Every pool holds two reserves. A buy takes your token out and puts the stock in, so each next token costs a little more. The product of the two reserves stays constant.
              </p>
              <PricingDemo />
            </section>
            <section className="card" id="d-labels">
              <div className="label">Liquidity labels</div>
              <h2>Check the liquidity before you buy</h2>
              <p>Whoever supplied a pool&apos;s liquidity can pull it out unless it&apos;s burned or locked. Every pool on Oxbow carries one of these labels.</p>
              <div className="lg">
                {LEGEND.map(([lp, txt]) => (
                  <div key={lp.status}>
                    <span>
                      <LpBadge lp={lp} />
                    </span>
                    <p>{txt}</p>
                  </div>
                ))}
              </div>
            </section>
            <section className="card" id="d-fees">
              <div className="label">Fees</div>
              <h2>What it costs</h2>
              <p>Creating a pool costs a one-time setup in SOL, plus your deposit. Trading fees on every swap go to liquidity providers, not to Oxbow.</p>
              <table className="ftable">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Network rent</td>
                    <td>{NETWORK_RENT_SOL} SOL</td>
                  </tr>
                  {VENUES.map((v) => (
                    <tr key={v.id}>
                      <td>{v.label} setup</td>
                      <td>{v.setupSol} SOL</td>
                    </tr>
                  ))}
                  <tr>
                    <td>Oxbow fee</td>
                    <td>{oxbowFeeSol} SOL</td>
                  </tr>
                  <tr>
                    <td>Trading fee per swap, paid to LPs</td>
                    <td>
                      {minFee} to {maxFee}
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>
            <section className="card" id="d-faq">
              <div className="label">FAQ</div>
              <h2>Questions</h2>
              <details>
                <summary>Do I need to own the token&apos;s mint?</summary>
                <p>No. Anyone holding a token can create a pool for it. Buyers see who created each pool and who holds its liquidity.</p>
              </details>
              <details>
                <summary>Which stocks can I pair with?</summary>
                <p>Any stock token on the verified list. Oxbow only lists stock tokens whose issuer publishes a price feed and that have enough liquidity to route trades.</p>
              </details>
              <details>
                <summary>Can I take my liquidity back?</summary>
                <p>If you left it unlocked, yes, any time. If you locked it, when the lock ends. If you burned it, never. In every case you keep collecting trading fees.</p>
              </details>
              <details>
                <summary>Where does my pool trade?</summary>
                <p>On the venue you picked: Raydium, Meteora or Orca. Aggregators like Jupiter route trades into it automatically.</p>
              </details>
            </section>
          </div>
        </div>
      </div>
    </section>
  );
}
