import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/legal/LegalPage';
import { getT } from '@/i18n/server';
import { legal, restrictedRegions } from '@/lib/legal';

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
          ],
        },
        {
          h: 'What Oxbow does, and what it does not',
          body: [
            'Oxbow is a non-custodial interface. It helps you build transactions that you sign in your own wallet. We never hold your funds or private keys and cannot reverse, cancel or recover a transaction.',
            'Oxbow shows the on-chain trades of wallets it tracks, and lets you place a similar trade from your own wallet. Trades route through Jupiter and the pools it uses. We do not operate these protocols and are not responsible for how they work, their fees or their availability.',
            'Oxbow never trades for you. Nothing is copied automatically: every trade is a transaction you review and approve yourself.',
            'Trade data, profit figures, win rates and safety checks are computed from on-chain data and third-party feeds. They can be delayed, incomplete or wrong. They are information, not a guarantee.',
          ],
        },
        {
          h: 'Tracked and featured wallets',
          body: [
            'Wallets on Oxbow are public blockchain addresses. A "featured" mark means the Oxbow team chose to highlight the wallet; it is not an endorsement or a recommendation, and past results say nothing certain about future ones.',
            'Anyone can add a wallet to be tracked. Nicknames you give wallets stay in your browser. We may stop tracking or hide any wallet, for example when it appears to be used for manipulation or abuse.',
          ],
        },
        {
          h: 'Fees',
          body: [
            'Trades placed through Oxbow include an Oxbow fee on the SOL side of the trade, shown on the quote before you sign. Network fees go to the network, and the fees of the pools a trade routes through go to those pools, not to us. Watching the feed and tracking wallets are free.',
          ],
        },
        {
          h: 'Things you must not do',
          body: [
            'Do not use Oxbow for market manipulation, wash trading, pump-and-dump schemes, luring people into copying trades you profit from, fraud, money laundering, sanctions evasion or anything illegal. Do not attack, overload or scrape Oxbow beyond normal use, and do not impersonate other projects.',
          ],
        },
        {
          h: 'Risks and no advice',
          body: [
            <>
              Trading tokens, and copying other wallets&apos; trades, can lose you all of your money. Read the <Link href="/risk">Risk disclosure</Link> before you use Oxbow. Nothing on Oxbow is
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
