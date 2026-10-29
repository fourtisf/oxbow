'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useT } from '@/i18n/client';
import { networkLabel } from '@/lib/env';
import { NAV, social } from '@/lib/site';
import { BookIcon, DashIcon, PlusIcon, SearchIcon, XLogo } from '../ui/Icons';
import { BrandMark } from './BrandMark';
import { WalletButton } from './WalletButton';

const ICONS = {
  '/explore': (m: boolean) => <SearchIcon sw={m ? 1.8 : 1.7} />,
  '/create': (m: boolean) => <PlusIcon sw={m ? 1.8 : 1.7} />,
  '/dashboard': (m: boolean) => <DashIcon sw={m ? 1.7 : 1.6} />,
  '/docs': (m: boolean) => <BookIcon sw={m ? 1.7 : 1.6} />,
};

const isActive = (path: string, href: string) => path === href || path.startsWith(href + '/');

function useNavLabels() {
  const t = useT();
  return {
    '/explore': [t.nav.explore, t.nav.explore],
    '/create': [t.nav.create, t.nav.createShort],
    '/dashboard': [t.nav.dashboard, t.nav.dashboard],
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
          <a href={social.x} aria-label={t.nav.onX} target={social.x === '#' ? undefined : '_blank'} rel="noreferrer">
            <XLogo />
          </a>
        </nav>
        <div className="nav-end">
          <span className="netpill">
            <span className="live" aria-hidden="true" />
            {networkLabel}
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
