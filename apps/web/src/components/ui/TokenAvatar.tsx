'use client';

import { useState, useSyncExternalStore } from 'react';
import type { AssetRef, Brand } from '@oxbow/shared';
import { avatarSrc, avatarStore } from '@/lib/avatar';
import { useHydrated } from '@/lib/hooks';

export type AvatarAsset = Pick<AssetRef, 'symbol' | 'logoUri'> & { brand?: Brand | null };

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

  if (!asset) return <span className="av" style={{ ...dim, background: '#16263D' }} />;
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

/** Overlapping base + quote avatars (`pairAv`). */
export function PairAvatar({ base, quote, size = 32 }: { base: AvatarAsset | null; quote: AvatarAsset | null; size?: number }) {
  const off = Math.round(size * 0.62);
  return (
    <span className="pairav" style={{ width: size + off, height: size }}>
      <span style={{ position: 'absolute', left: 0, top: 0 }}>
        <TokenAvatar asset={base} size={size} />
      </span>
      <span style={{ position: 'absolute', left: off, top: 0 }}>
        <TokenAvatar asset={quote} size={size} />
      </span>
    </span>
  );
}
