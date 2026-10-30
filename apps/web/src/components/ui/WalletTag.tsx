'use client';

import Link from 'next/link';
import { shortAddr } from '@oxbow/shared';
import { walletHref } from '@/lib/links';
import { useWalletName } from '@/lib/store/follow';
import { useHydrated } from '@/lib/hooks';
import { avatarSrc } from '@/lib/avatar';
import { FeaturedChip, SmartChip } from './badges';
import { cx } from './primitives';

/** Pixel identicon drawn from the address (canvas, so client only). */
export function WalletAvatar({ address, size = 28 }: { address: string; size?: number }) {
  const hydrated = useHydrated();
  if (!hydrated) return <span className="av wav" style={{ width: size, height: size }} />;
  return <img className="av wav" src={avatarSrc(address, null)} width={size} height={size} alt="" />;
}

/** A wallet as lists show it: avatar, the viewer's nickname or the featured label or the short address, and the featured star. */
export function WalletTag({
  address,
  label,
  featured,
  smart,
  link = true,
  size = 28,
  className,
}: {
  address: string;
  label?: string | null;
  featured?: boolean;
  smart?: boolean;
  link?: boolean;
  size?: number;
  className?: string;
}) {
  const name = useWalletName(address, label);
  const body = (
    <>
      <WalletAvatar address={address} size={size} />
      <span className="wname">
        <b className={name ? undefined : 'mono'} suppressHydrationWarning>
          {name ?? shortAddr(address)}
        </b>
        {featured ? <FeaturedChip /> : smart ? <SmartChip /> : null}
      </span>
    </>
  );
  if (!link) return <span className={cx('wtag', className)}>{body}</span>;
  return (
    <Link className={cx('wtag', className)} href={walletHref(address)}>
      {body}
    </Link>
  );
}
