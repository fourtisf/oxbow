import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import { Hydrate } from '@/lib/api/Hydrate';
import { Footer } from '@/components/layout/Footer';
import { MobileTabs, Nav } from '@/components/layout/Nav';
import { Providers } from '@/components/layout/Providers';
import { Ticker } from '@/components/layout/Ticker';
import { WalletModal } from '@/components/layout/WalletButton';
import { Toaster } from '@/components/ui/Toaster';
import { Prefetch } from '@/lib/api/server';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: { default: 'Oxbow | Stock-paired pools on Solana', template: '%s | Oxbow' },
  description:
    'Create a stock-paired liquidity pool for any token on Solana. Pair your memecoin with Tesla, Nvidia, the S&P 500 or any verified stock token.',
};

export const viewport: Viewport = {
  themeColor: '#03060C',
  width: 'device-width',
  initialScale: 1,
};

// Mock data is computed per request (ages, lock countdowns). Revisit caching with real data in M2.
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children, drawer }: { children: ReactNode; drawer: ReactNode }) {
  const pf = new Prefetch();
  await pf.ticker();
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <div className="bg" aria-hidden="true" />
        <div className="grain" aria-hidden="true" />
        <Providers>
          <Hydrate state={pf.state()}>
            <Ticker />
          </Hydrate>
          <Nav />
          <MobileTabs />
          <main>{children}</main>
          <Footer />
          {drawer}
          <WalletModal />
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
