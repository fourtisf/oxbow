import Link from 'next/link';
import type { TokenBrief } from '@oxbow/shared';
import { tokenHref } from '@/lib/links';
import { TokenAvatar } from './TokenAvatar';
import { cx } from './primitives';

/** Token avatar and symbol, linking to its page. Symbols are untrusted metadata, rendered as text. */
export function TokenTag({ token, size = 24, name, className }: { token: TokenBrief; size?: number; name?: boolean; className?: string }) {
  return (
    <Link className={cx('ttag', className)} href={tokenHref(token.mint)} title={token.name || token.symbol}>
      <TokenAvatar asset={token} size={size} />
      <b>{token.symbol}</b>
      {name && token.name && <span className="muted">{token.name}</span>}
    </Link>
  );
}
