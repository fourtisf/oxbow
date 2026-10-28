import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import Script from 'next/script';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import { Footer } from '@/components/layout/Footer';
import { MobileTabs, Nav } from '@/components/layout/Nav';
import { Providers } from '@/components/layout/Providers';
import { SampleBanner } from '@/components/layout/SampleBanner';
import { Ticker } from '@/components/layout/Ticker';
import { WalletModal } from '@/components/layout/WalletButton';
import { Toaster } from '@/components/ui/Toaster';
import { I18nProvider } from '@/i18n/client';
import { getLocale, getT } from '@/i18n/server';
import { Hydrate } from '@/lib/api/Hydrate';
import { Prefetch } from '@/lib/api/server';
import { siteUrl } from '@/lib/links';
import '@/styles/globals.css';

export function generateMetadata(): Metadata {
  const t = getT();
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: t.meta.title, template: '%s | Oxbow' },
    description: t.meta.description,
    openGraph: { type: 'website', siteName: 'Oxbow', title: t.meta.title, description: t.meta.description },
    twitter: { card: 'summary_large_image', title: t.meta.title, description: t.meta.description },
  };
}

export const viewport: Viewport = {
  themeColor: '#03060C',
  width: 'device-width',
  initialScale: 1,
};

// Mock data is computed per request (ages, lock countdowns). Revisit caching with real data in M2.
export const dynamic = 'force-dynamic';

/**
 * Lite mode for phones with ≤4 GB of memory, very slow CPUs and data-saver:
 * drops backdrop blur, grain and the city animation. Runs before paint so
 * nothing flashes. iPhones don't report memory and handle blur well.
 */
const LITE = `try{var n=navigator,c=n.connection,touch=matchMedia('(pointer: coarse)').matches;if((c&&c.saveData)||(touch&&n.deviceMemory&&n.deviceMemory<=4)||(n.hardwareConcurrency&&n.hardwareConcurrency<=2)||matchMedia('(prefers-reduced-data: reduce)').matches)document.documentElement.classList.add('lite')}catch(e){}`;

const PLAUSIBLE = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;

export default async function RootLayout({ children, drawer }: { children: ReactNode; drawer: ReactNode }) {
  const locale = getLocale();
  const pf = new Prefetch();
  await pf.ticker();
  return (
    // suppressHydrationWarning: the lite-mode script may add a class before React hydrates.
    <html lang={locale} className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: LITE }} />
      </head>
      <body>
        <div className="bg" aria-hidden="true" />
        <div className="grain" aria-hidden="true" />
        <I18nProvider locale={locale}>
          <Providers>
            <SampleBanner />
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
        </I18nProvider>
        {PLAUSIBLE && <Script defer data-domain={PLAUSIBLE} src={process.env.NEXT_PUBLIC_PLAUSIBLE_SRC || 'https://plausible.io/js/script.js'} strategy="afterInteractive" />}
      </body>
    </html>
  );
}
