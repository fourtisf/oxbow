'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

export const poolHref = (address: string, tab?: 'swap' | 'add') => `/pool/${address}${tab === 'add' ? '?tab=add' : ''}`;

/** Opens the pool drawer (intercepted /pool/[address] route) without scrolling the page. */
export function useOpenPool() {
  const router = useRouter();
  return useCallback((address: string, tab?: 'swap' | 'add') => router.push(poolHref(address, tab), { scroll: false }), [router]);
}
