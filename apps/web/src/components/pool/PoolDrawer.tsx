'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/i18n/client';
import { prefersReducedMotion, useBodyLock } from '@/lib/hooks';
import { Portal, useDialogFocus, useEscape, usePresence } from '../ui/overlay';
import { cx } from '../ui/primitives';
import { PoolView } from './PoolBody';
import type { TradeTab } from './TradePanel';

/**
 * Right-side pool drawer, rendered by the intercepted /pool/[address] route.
 * Closing slides it out, then steps back in history so the URL returns to the
 * page underneath.
 */
export function PoolDrawer({ address, tab }: { address: string; tab: TradeTab }) {
  const router = useRouter();
  const t = useT();
  const [open, setOpen] = useState(true);
  const { mounted, on } = usePresence(open, 360);
  const ref = useRef<HTMLElement>(null);
  const closing = useRef(false);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    setOpen(false);
    setTimeout(() => router.back(), prefersReducedMotion() ? 0 : 360);
  }, [router]);

  useBodyLock(open);
  useDialogFocus(ref, on, '[data-close-drawer]');
  // Modals (wallet picker) sit above the drawer and handle Escape themselves.
  useEscape(open, () => {
    if (!document.querySelector('.modal.on')) close();
  });

  if (!mounted) return null;
  return (
    <Portal>
      <div className={cx('scrim', on && 'on')} onClick={close} aria-hidden="true" />
      <aside ref={ref} className={cx('drawer', on && 'on')} role="dialog" aria-modal="true" aria-label={t.pool.details}>
        <PoolView address={address} tab={tab} onClose={close} />
      </aside>
    </Portal>
  );
}
