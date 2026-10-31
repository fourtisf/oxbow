'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useT } from '@/i18n/client';
import { NAV, social } from '@/lib/site';
import { BookIcon, PulseIcon, StarIcon, WalletIcon, XLogo } from '../ui/Icons';
import { BrandMark } from './BrandMark';
import { CaChip } from './CaChip';
import { WalletButton } from './WalletButton';

const ICONS = {
  '/': () => <PulseIcon />,
  '/wallets': () => <WalletIcon width={18} height={18} />,
  '/following': () => <StarIcon width={17} height={17} />,
  '/docs': (m: boolean) => <BookIcon sw={m ? 1.7 : 1.6} />,
};

const isActive = (path: string, href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'));

function useNavLabels() {
  const t = useT();
  return {
    '/': [t.nav.feed, t.nav.feed],
    '/wallets': [t.nav.wallets, t.nav.wallets],
    '/following': [t.nav.following, t.nav.following],
    '/docs': [t.nav.docs, t.nav.docs],
  } as const;
}

export function Nav() {
  const path = usePathname();
  const t = useT();
  const labels = useNavLabels();
  return (
    <header className="nav">
      <div className="wrap">
        <Link className="brand" href="/" aria-label={t.nav.home}>
          <BrandMark />
          oxbow
        </Link>
        <nav className="navlinks" aria-label={t.nav.main}>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={isActive(path, n.href) ? 'page' : undefined}>
              {ICONS[n.href](false)}
              {labels[n.href][0]}
            </Link>
          ))}
          {social.x && (
            <a href={social.x} aria-label={t.nav.onX} target="_blank" rel="noopener noreferrer">
              <XLogo />
            </a>
          )}
        </nav>
        <div className="nav-end">
          <CaChip className="nav-ca" />
          <span className="netpill">
            <span className="live" aria-hidden="true" />
            {t.nav.mainnet}
          </span>
          <WalletButton />
        </div>
      </div>
    </header>
  );
}

/** Fixed bottom tab bar on mobile (`.mtabs`, ≤900px). */
export function MobileTabs() {
  const path = usePathname();
  const t = useT();
  const labels = useNavLabels();
  return (
    <nav className="mtabs" aria-label={t.nav.mainMobile}>
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} aria-current={isActive(path, n.href) ? 'page' : undefined}>
          {ICONS[n.href](true)}
          {labels[n.href][1]}
        </Link>
      ))}
    </nav>
  );
}
