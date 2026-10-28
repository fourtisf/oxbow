'use client';

import { useState, useSyncExternalStore } from 'react';
import type { AssetRef, Brand } from '@oxbow/shared';
import { avatarSrc, avatarStore } from '@/lib/avatar';
import { useHydrated } from '@/lib/hooks';

export type AvatarAsset = Pick<AssetRef, 'symbol' | 'logoUri'> & { brand?: Brand | null };

/**
 * Token avatar (`av`): brand tile for stocks/SOL/USDC, the token's metadata
 * logo when it has one, otherwise the generated pixel identicon. Generated
 * images are drawn in the browser, so SSR renders a same-size placeholder.
 */
export function TokenAvatar({ asset, size = 30 }: { asset: AvatarAsset | null; size?: number }) {
  const hydrated = useHydrated();
  useSyncExternalStore(avatarStore.subscribe, avatarStore.version, () => 0);
  const [logoFailed, setLogoFailed] = useState(false);
  const dim = { width: size, height: size };

  if (!asset) return <span className="av" style={{ ...dim, background: '#16263D' }} />;
  const sq = asset.brand ? 'av sq' : 'av';
  if (!hydrated) return <span className={sq} style={dim} />;
  if (asset.logoUri && !asset.brand && !logoFailed) {
    return <img className="av" src={asset.logoUri} width={size} height={size} alt="" referrerPolicy="no-referrer" onError={() => setLogoFailed(true)} />;
  }
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
