'use client';

import { HydrationBoundary, type DehydratedState } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { db } from './mock/db';

/**
 * <HydrationBoundary> for server-prefetched data.
 *
 * M1 only: the server and the browser each run their own mock database. Once
 * a mock transaction changes the browser's copy (new pool, added liquidity),
 * server data is stale by definition, so it is dropped and the client's own
 * queries win. With the real API in M2 this becomes a plain HydrationBoundary.
 */
export function Hydrate({ state, children }: { state: DehydratedState; children: ReactNode }) {
  const s = typeof window !== 'undefined' && db().dirty ? { ...state, queries: [] } : state;
  return <HydrationBoundary state={s}>{children}</HydrationBoundary>;
}
