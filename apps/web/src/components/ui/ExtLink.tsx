'use client';

import type { ReactNode } from 'react';
import { useT } from '@/i18n/client';
import { SAMPLE_DATA } from '@/lib/api/mode';
import { ExternalIcon } from './Icons';
import { cx } from './primitives';

/**
 * Outbound link (Solscan, DexScreener, Birdeye, Jupiter). On sample data
 * every address is made up, so instead of opening a "not found" page the link
 * shows as disabled with the reason; `data-href` keeps the URL it would open.
 * Icon-only links (`label`) are left out entirely on sample data.
 */
export function ExtLink({ href, className = 'xlink', label, icon = true, children }: { href: string; className?: string; label?: string; icon?: boolean; children?: ReactNode }) {
  const t = useT();
  const body = (
    <>
      {children}
      {icon && (children ? <> <ExternalIcon /></> : <ExternalIcon />)}
    </>
  );
  if (SAMPLE_DATA) {
    if (label) return null;
    return (
      <span className={cx(className, 'off')} aria-disabled="true" title={t.common.sampleLink} data-href={href}>
        {body}
      </span>
    );
  }
  return (
    <a className={className} href={href} target="_blank" rel="noopener noreferrer" aria-label={label}>
      {body}
    </a>
  );
}
