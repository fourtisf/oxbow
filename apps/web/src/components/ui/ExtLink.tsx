'use client';

import type { ReactNode } from 'react';
import { ExternalIcon } from './Icons';

/** Outbound link (Solscan, DexScreener, Birdeye) in a new tab. */
export function ExtLink({ href, className = 'xlink', label, icon = true, children }: { href: string; className?: string; label?: string; icon?: boolean; children?: ReactNode }) {
  const body = (
    <>
      {children}
      {icon && (children ? <> <ExternalIcon /></> : <ExternalIcon />)}
    </>
  );
  return (
    <a className={className} href={href} target="_blank" rel="noopener noreferrer" aria-label={label}>
      {body}
    </a>
  );
}
