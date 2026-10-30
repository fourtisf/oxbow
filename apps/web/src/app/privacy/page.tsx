import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/LegalPage';
import { getT } from '@/i18n/server';
import { legal } from '@/lib/legal';

export function generateMetadata(): Metadata {
  return { title: getT().meta.privacy };
}

export default function PrivacyPage() {
  const t = getT();
  return (
    <LegalPage
      eyebrow={t.footer.legal}
      title={t.meta.privacy}
      lede="What Oxbow collects, why, and what stays in your browser."
      sections={[
        {
          h: 'The short version',
          body: [
            'Oxbow has no accounts. We never ask for, see or store your private key or seed phrase. Blockchain data is public by design: anything your wallet does on Solana can be seen by anyone, with or without Oxbow.',
          ],
        },
        {
          h: 'What we process',
          body: [
            'Wallet address: when you connect, the interface uses your public address to read your balances and to build the trades you ask for. Our servers see it in those requests.',
            'Wallets you track: when you add a wallet to be tracked, or open the feed of wallets you follow, our servers see those (public) addresses. We do not link them to you.',
            'Location: our hosting provider tells us your country from your IP address so we can block restricted regions. We use it for that check and do not store it with your activity.',
            'Server logs: our servers keep standard request logs (time, page, IP address, browser) for security and debugging, for up to 30 days.',
            'Analytics: if enabled, we use a privacy-focused analytics service without cookies to count page views and actions like "wallet followed". Wallet addresses and amounts are never sent.',
            'Error reports: if enabled, crashes are sent to an error-monitoring service with technical details about the error and your browser.',
          ],
        },
        {
          h: 'Stored in your browser',
          body: [
            'The wallets you follow, the nicknames you give them, your alert settings and whether you accepted these terms are saved in your browser (cookies and local storage) and never sent to us as a profile. Clearing your browser data removes them.',
          ],
        },
        {
          h: 'Service providers',
          body: [
            'We use providers to run Oxbow: hosting, Solana RPC and data providers (to read the chain), Jupiter (token data, prices and trade routes), and the optional analytics and error-monitoring services. They process data only to provide their service to us.',
          ],
        },
        {
          h: 'Your choices and contact',
          body: [
            `You can use Oxbow without connecting a wallet to browse. Depending on where you live you may have rights to access or delete personal data we hold. Contact ${legal.contact}. This policy is provided by ${legal.entity}.`,
          ],
        },
      ]}
    />
  );
}
