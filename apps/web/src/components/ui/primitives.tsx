/**
 * Small presentational pieces from the prototype: Card, BracketCorners,
 * Button, Fmt. Server-safe (no hooks). Translated badges live in badges.tsx.
 */
import Link from 'next/link';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { fromSubscript } from '@oxbow/shared';

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

export function LiveDot() {
  return <span className="live" aria-hidden="true" />;
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('label', className)}>{children}</span>;
}
