'use client';

import { useState, useSyncExternalStore } from 'react';
import { avatarSrc, avatarStore, type Brand } from '@/lib/avatar';
import { useHydrated } from '@/lib/hooks';

export type AvatarAsset = { symbol: string; logoUri: string | null; brand?: Brand | null };

/**
 * Token avatar (`av`): the token's logo when it has one, otherwise a drawn
 * stand-in (brand tile for stocks/SOL/USDC, pixel identicon for the rest).
 * Logos render on the server; drawn avatars need a canvas, so SSR renders a
 * same-size placeholder for those. Stock logos are rounded squares, the rest
 * are circles.
 */
export function TokenAvatar({ asset, size = 30, eager = false }: { asset: AvatarAsset | null; size?: number; eager?: boolean }) {
  const hydrated = useHydrated();
  useSyncExternalStore(avatarStore.subscribe, avatarStore.version, () => 0);
  const [failed, setFailed] = useState<string | null>(null);
  const dim = { width: size, height: size };

  // No token picked yet: an empty slot, not a made-up token.
  if (!asset) return <span className="av av-empty" style={dim} />;
  if (asset.logoUri && failed !== asset.logoUri) {
    const src = asset.logoUri;
    return (
      <img
        className={asset.brand?.stock ? 'av sq' : 'av'}
        src={src}
        width={size}
        height={size}
        alt=""
        // The ticker scrolls logos into view on its own, so it loads them up front.
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        referrerPolicy="no-referrer"
        // An image that failed before hydration never fires onError, so check on mount too.
        ref={(el) => {
          if (el?.complete && el.naturalWidth === 0) setFailed(src);
        }}
        onError={() => setFailed(src)}
      />
    );
  }
  const sq = asset.brand ? 'av sq' : 'av';
  if (!hydrated) return <span className={sq} style={dim} />;
  return <img className={sq} src={avatarSrc(asset.symbol, asset.brand ?? null)} width={size} height={size} alt="" />;
}
