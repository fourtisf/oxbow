'use client';

import { HydrationBoundary, type DehydratedState } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/** <HydrationBoundary> for server-prefetched data. */
export function Hydrate({ state, children }: { state: DehydratedState; children: ReactNode }) {
  return <HydrationBoundary state={state}>{children}</HydrationBoundary>;
}
