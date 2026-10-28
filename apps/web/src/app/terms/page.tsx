import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/legal/LegalPage';
import { getT } from '@/i18n/server';
import { legal, restrictedRegions } from '@/lib/legal';
import { oxbowFeeSol } from '@/lib/env';

export function generateMetadata(): Metadata {
  return { title: getT().meta.terms };
}

export default function TermsPage() {
  const t = getT();
  const regions = restrictedRegions();
  return (
    <LegalPage
      eyebrow={t.footer.legal}
      title={t.meta.terms}
      lede="The rules for using the Oxbow interface. Please read them before connecting a wallet."
      sections={[
        {
          h: 'Who we are and what this covers',
          body: [
            `Oxbow is a website operated by ${legal.entity} ("we"). These Terms apply to your use of the Oxbow website and interface ("Oxbow"). By connecting a wallet or using Oxbow you agree to them. If you do not agree, do not use Oxbow.`,
          ],
        },
        {
          h: 'Who can use Oxbow',
          body: [
            'You must be at least 18 and able to enter a binding agreement. You may not use Oxbow if you are subject to sanctions, or if using it, or holding the tokens it shows, is illegal where you live.',
            regions.length
              ? `Oxbow is not offered to residents of, or people located in: ${regions.join(', ')}. We block access from these regions where we can detect them. Using a VPN or other means to get around this is a breach of these Terms.`
              : 'Some regions are not served. Where we can detect your location we block access from them, and using a VPN or other means to get around this is a breach of these Terms.',
            'Tokenized stocks are restricted by their issuers in several countries. You are responsible for checking that you may hold and trade them where you live.',
          ],
        },
        {
          h: 'What Oxbow does, and what it does not',
          body: [
            'Oxbow is a non-custodial interface. It helps you build transactions that you sign in your own wallet. We never hold your funds or private keys and cannot reverse, cancel or recover a transaction.',
            'Pools live on third-party protocols (Raydium, Meteora, Orca) and trades may route through aggregators such as Jupiter. We do not operate these protocols and are not responsible for how they work, their fees or their availability.',
            'Market data, liquidity labels and safety checks are computed from on-chain data and third-party feeds. They can be delayed, incomplete or wrong. They are information, not a guarantee.',
          ],
        },
        {
          h: 'Stock tokens',
          body: [
            'Stock tokens shown on Oxbow (for example tokens issued under the xStocks brand) are issued by third parties, not by us. They are not shares: they generally carry no voting rights and their value depends on the issuer. The issuer’s own terms apply to them, including where they may be held.',
            'A "verified" mark means the token passed our listing checks (its mint matches the issuer’s published list, its price feed responds and there is enough liquidity to route trades). It is not an endorsement or a recommendation.',
          ],
        },
        {
          h: 'Pools you create',
          body: [
            'Anyone holding a token can create a pool for it. Creating a pool does not mean we have reviewed, approved or endorse that token or its creator. You are responsible for the tokens you pair and for the liquidity lock you choose.',
            'We may hide pools or tokens from the Oxbow interface, for example when they appear fraudulent, infringe rights or break the law. This does not affect the pool on-chain.',
          ],
        },
        {
          h: 'Fees',
          body: [
            `Creating a pool through Oxbow includes an Oxbow fee (currently ${oxbowFeeSol} SOL), shown before you sign. Network rent and venue setup costs go to the network and the venue. Trading fees on each swap go to the pool's liquidity providers, not to us.`,
          ],
        },
        {
          h: 'Things you must not do',
          body: [
            'Do not use Oxbow for market manipulation, wash trading, pump-and-dump schemes, fraud, money laundering, sanctions evasion or anything illegal. Do not attack, overload or scrape Oxbow beyond normal use, and do not impersonate other projects.',
          ],
        },
        {
          h: 'Risks and no advice',
          body: [
            <>
              Trading and providing liquidity can lose you all of your money. Read the <Link href="/risk">Risk disclosure</Link> before you use Oxbow. Nothing on Oxbow is
              financial, investment, legal or tax advice.
            </>,
          ],
        },
        {
          h: 'No warranty and limits on liability',
          body: [
            'Oxbow is provided "as is" and "as available", without warranties of any kind. To the extent the law allows, we are not liable for losses arising from your use of Oxbow, including losses from smart-contract failures, third-party protocols, price feeds, network outages, wallet issues or your own mistakes.',
          ],
        },
        {
          h: 'Changes, law and contact',
          body: [
            'We may change these Terms. The date at the top shows the latest version; continuing to use Oxbow after a change means you accept it. We may change or stop Oxbow at any time.',
            `These Terms are governed by ${legal.law}. Questions: ${legal.contact}.`,
          ],
        },
      ]}
    />
  );
}
