'use client';

/**
 * Privacy-friendly product analytics. When NEXT_PUBLIC_PLAUSIBLE_DOMAIN is
 * set, the layout loads Plausible (or any script with the same `plausible()`
 * API, e.g. a self-hosted instance via NEXT_PUBLIC_PLAUSIBLE_SRC) and these
 * events are sent. Otherwise `track` does nothing. No wallet addresses or
 * amounts are sent.
 */
type Props = Record<string, string | number | boolean>;
declare global {
  interface Window {
    plausible?: (event: string, opts?: { props?: Props }) => void;
  }
}

export type TrackEvent =
  | 'wallet_connected'
  | 'pool_create_started'
  | 'pool_created'
  | 'swap'
  | 'liquidity_added'
  | 'fees_claimed'
  | 'liquidity_withdrawn'
  | 'pool_shared'
  | 'watchlist_add'
  | 'language_changed';

export function track(event: TrackEvent, props?: Props) {
  try {
    window.plausible?.(event, props ? { props } : undefined);
  } catch {
    // Analytics must never break the app.
  }
}
