'use client';

import { shortAddr } from '@oxbow/shared';
import { useT } from '@/i18n/client';
import { copyText } from '@/lib/copy';
import { env } from '@/lib/env';
import { CopyIcon } from '../ui/Icons';

/**
 * Oxbow's token contract address (NEXT_PUBLIC_CONTRACT_ADDRESS): "CA Coming soon" until it is set,
 * then the shortened address, copied on click.
 */
export function CaChip({ className = '' }: { className?: string }) {
  const t = useT();
  const ca = env.contractAddress;
  if (!ca)
    return (
      <span className={`cachip soon ${className}`}>
        <b>CA</b>
        {t.home.caSoon}
      </span>
    );
  return (
    <button type="button" className={`cachip ${className}`} aria-label={t.home.copyCa} title={ca} onClick={() => copyText(ca)}>
      <b>CA</b>
      <span className="mono">{shortAddr(ca)}</span>
      <CopyIcon />
    </button>
  );
}
