'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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

export function Nav() {
  const path = usePathname();
  return (
    <header className="nav">
      <div className="wrap">
        <Link className="brand" href="/" aria-label="Oxbow home">
          <BrandMark />
          Oxbow
        </Link>
        <nav className="navlinks" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={isActive(path, n.href) ? 'page' : undefined}>
              {ICONS[n.href](false)}
              {n.label}
            </Link>
          ))}
          <a href={social.x} aria-label="Oxbow on X" target={social.x === '#' ? undefined : '_blank'} rel="noreferrer">
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
  return (
    <nav className="mtabs" aria-label="Main mobile">
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} aria-current={isActive(path, n.href) ? 'page' : undefined}>
          {ICONS[n.href](true)}
          {n.short}
        </Link>
      ))}
    </nav>
  );
}
