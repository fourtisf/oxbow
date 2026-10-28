/**
 * Small presentational pieces from the prototype: Card, BracketCorners,
 * Button, ChangePill, LpBadge, VerifiedChip, Fmt. Server-safe (no hooks).
 */
import Link from 'next/link';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { daysUntil, fromSubscript, pct, type LpState } from '@oxbow/shared';
import { FlameIcon, HalfIcon, LockIcon, ShieldIcon, UnlockIcon } from './Icons';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/** Glass panel with the 1px gradient border (`.card`). */
export function Card({ corners, className, children, as: Tag = 'div', ...rest }: HTMLAttributes<HTMLElement> & { corners?: boolean; as?: 'div' | 'section' | 'aside' | 'li' | 'nav' }) {
  return (
    <Tag className={cx('card', className)} {...rest}>
      {corners && <BracketCorners />}
      {children}
    </Tag>
  );
}

/** Glowing corner brackets (`.cn`). */
export const BracketCorners = () => <i className="cn" aria-hidden="true" />;

type Variant = 'primary' | 'glass';
type Size = 'sm' | 'md' | 'lg';
interface BtnStyle {
  variant?: Variant;
  size?: Size;
  block?: boolean;
}
export const btnClass = ({ variant = 'primary', size = 'md', block }: BtnStyle, extra?: string) =>
  cx('btn', variant === 'primary' ? 'btn-pri' : 'btn-glass', size === 'sm' && 'btn-sm', size === 'lg' && 'btn-lg', block && 'btn-block', extra);

export function Button({ variant, size, block, className, type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & BtnStyle) {
  return <button type={type} className={btnClass({ variant, size, block }, className)} {...rest} />;
}

export function ButtonLink({ variant, size, block, className, href, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & BtnStyle & { href: string; scroll?: boolean }) {
  return <Link href={href} className={btnClass({ variant, size, block }, className)} {...rest} />;
}

/** Renders the subscript-zero digits of formatted numbers ("$0.0₅228") as <sub>, like the prototype. */
export function Fmt({ children }: { children: string }) {
  const parts = children.split(/([₀-₉]+)/);
  if (parts.length === 1) return <>{children}</>;
  return (
    <>
      {parts.map((p, i) => (i % 2 ? <sub key={i}>{fromSubscript(p)}</sub> : p))}
    </>
  );
}

export function ChangePill({ value }: { value: number }) {
  const up = value >= 0;
  return (
    <span className={cx('chg', up ? 'up' : 'down')}>
      <i aria-hidden="true">{up ? '▲' : '▼'}</i>
      <span className="sr-only">{up ? 'up ' : 'down '}</span>
      {pct(Math.abs(value))}
    </span>
  );
}

export function VerifiedChip() {
  return (
    <span className="vchk">
      <ShieldIcon />
      VERIFIED
    </span>
  );
}

export interface LpBadgeInput {
  status: LpState['status'];
  lockedPct: number;
  unlockAt?: string | null;
  /** Days to show on LOCKED when there's no unlock time yet (create preview, docs legend). */
  days?: number;
}

export function LpBadge({ lp }: { lp: LpBadgeInput }) {
  switch (lp.status) {
    case 'BURNED':
      return (
        <span className="lp burned">
          <FlameIcon />
          BURNED
        </span>
      );
    case 'LOCKED': {
      const d = lp.unlockAt ? daysUntil(lp.unlockAt) : lp.days ?? 0;
      return (
        <span className="lp locked" suppressHydrationWarning>
          <LockIcon />
          LOCKED {Math.round(d)}D
        </span>
      );
    }
    case 'PARTIAL':
      return (
        <span className="lp partial">
          <HalfIcon />
          {lp.lockedPct}% LOCKED
        </span>
      );
    default:
      return (
        <span className="lp unlocked">
          <UnlockIcon />
          UNLOCKED
        </span>
      );
  }
}

export function LiveDot() {
  return <span className="live" aria-hidden="true" />;
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('label', className)}>{children}</span>;
}
