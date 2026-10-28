/** Inline SVG icons from the prototype (`I` and the inline nav/section icons). */
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const base = { 'aria-hidden': true, focusable: false } as const;

export const LockIcon = (p: P) => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...base} {...p}>
    <rect x="3" y="7" width="10" height="7" rx="2" />
    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
  </svg>
);
export const UnlockIcon = (p: P) => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...base} {...p}>
    <rect x="3" y="7" width="10" height="7" rx="2" />
    <path d="M5.5 7V5a2.5 2.5 0 0 1 4.9-.7" />
  </svg>
);
export const FlameIcon = (p: P) => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" {...base} {...p}>
    <path d="M8 14.2c2.7 0 4.4-1.8 4.4-4.3 0-2.7-2-4-2.7-6.8-1.2 1-1.9 2.4-1.9 3.6-.9-.8-1.6-1.9-1.9-3.2-1.5 1.6-2.3 3.6-2.3 6.4 0 2.5 1.7 4.3 4.4 4.3Z" />
  </svg>
);
export const HalfIcon = (p: P) => (
  <svg width="12" height="12" viewBox="0 0 16 16" {...base} {...p}>
    <circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.9" />
    <path d="M8 2.4a5.6 5.6 0 0 1 0 11.2Z" fill="currentColor" />
  </svg>
);
export const CloseIcon = (p: P) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...base} {...p}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
);
export const CopyIcon = (p: P) => (
  <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" {...base} {...p}>
    <rect x="5.5" y="5.5" width="8" height="8" rx="2" />
    <path d="M10.5 5.5V4a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" />
  </svg>
);
export const CheckIcon = (p: P) => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...base} {...p}>
    <path d="m3.5 8.5 3 3 6-7" />
  </svg>
);
export const ShieldIcon = (p: P) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" {...base} {...p}>
    <path d="M12 3 4 6v6c0 4.4 3.4 8 8 9 4.6-1 8-4.6 8-9V6l-8-3Z" />
    <path d="m8.5 12 2.5 2.5 4.5-5" strokeLinecap="round" />
  </svg>
);
export const WalletIcon = (p: P) => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" {...base} {...p}>
    <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" />
    <rect x="4" y="8" width="16" height="11" rx="2.5" />
    <circle cx="16" cy="13.5" r="1.2" fill="currentColor" />
  </svg>
);
export const DropIcon = (p: P) => (
  <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" {...base} {...p}>
    <path d="M12 3.5c3.5 4.2 6 7.4 6 10.5a6 6 0 0 1-12 0c0-3.1 2.5-6.3 6-10.5Z" />
    <path d="m9.2 13.8 2 2 3.6-4" strokeLinecap="round" />
  </svg>
);
export const BarsIcon = (p: P) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...base} {...p}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </svg>
);
export const LiquidIcon = (p: P) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" {...base} {...p}>
    <path d="M12 3.5c3.5 4.2 6 7.4 6 10.5a6 6 0 0 1-12 0c0-3.1 2.5-6.3 6-10.5Z" />
  </svg>
);
export const TrendIcon = ({ size = 16, sw = 2, ...p }: P & { size?: number; sw?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" {...base} {...p}>
    <path d="m3 17 6-6 4 4 8-8M15 7h6v6" />
  </svg>
);
export const BoltIcon = (p: P) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" {...base} {...p}>
    <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
  </svg>
);
export const ArrowIcon = ({ size = 18, ...p }: P & { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...base} {...p}>
    <path d="M4 10h12M11 5l5 5-5 5" />
  </svg>
);
export const SwapIcon = (p: P) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...base} {...p}>
    <path d="M4 8h15l-4-4M20 16H5l4 4" />
  </svg>
);
export const ShieldLgIcon = ({ size = 18, sw = 1.9, ...p }: P & { size?: number; sw?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinejoin="round" {...base} {...p}>
    <path d="M12 3 4 6v6c0 4.4 3.4 8 8 9 4.6-1 8-4.6 8-9V6l-8-3Z" />
    <path d="m8.5 12 2.5 2.5 4.5-5" strokeLinecap="round" />
  </svg>
);
export const PulseIcon = (p: P) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...base} {...p}>
    <path d="M3 12h4l3-8 4 16 3-8h4" />
  </svg>
);
export const ChevronIcon = (p: P) => (
  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...base} {...p}>
    <path d="M3 4.5 6 7.5 9 4.5" />
  </svg>
);
export const SearchIcon = ({ size = 18, sw = 1.7, ...p }: P & { size?: number; sw?: number }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" {...base} {...p}>
    <circle cx="9" cy="9" r="6" />
    <path d="m13.5 13.5 3.5 3.5" />
  </svg>
);
export const SearchSmIcon = (p: P) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...base} {...p}>
    <circle cx="7" cy="7" r="4.6" />
    <path d="m10.5 10.5 3 3" />
  </svg>
);
export const PlusIcon = ({ sw = 1.7, ...p }: P & { sw?: number }) => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" {...base} {...p}>
    <path d="M10 4v12M4 10h12" />
  </svg>
);
export const DashIcon = ({ sw = 1.6, ...p }: P & { sw?: number }) => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinejoin="round" {...base} {...p}>
    <rect x="3" y="4" width="14" height="12" rx="2" />
    <path d="M3 8h14M7 4v4" />
  </svg>
);
export const BookIcon = ({ sw = 1.6, ...p }: P & { sw?: number }) => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinejoin="round" {...base} {...p}>
    <path d="M3 5.5c2.5-1.3 4.8-1.3 7 0v10c-2.2-1.3-4.5-1.3-7 0zM10 5.5c2.2-1.3 4.5-1.3 7 0v10c-2.5-1.3-4.8-1.3-7 0z" />
  </svg>
);
export const XLogo = (p: P) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" {...base} {...p}>
    <path d="M17.8 3h3.1l-6.8 7.8L22 21h-6.3l-4.9-6.4L5.2 21H2.1l7.3-8.3L1.8 3h6.4l4.4 5.9L17.8 3Zm-1.1 16.2h1.7L7.3 4.7H5.5l11.2 14.5Z" />
  </svg>
);
export const PlusCircleIcon = (p: P) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...base} {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M9 12h6M12 9v6" />
  </svg>
);
export const BackIcon = (p: P) => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...base} {...p}>
    <path d="M16 10H4M9 5l-5 5 5 5" />
  </svg>
);
export const WarnIcon = (p: P) => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...base} {...p}>
    <path d="M8 2.2 14.3 13.4H1.7L8 2.2Z" />
    <path d="M8 6.6v3M8 11.6v.1" />
  </svg>
);
export const StarIcon = ({ filled, ...p }: P & { filled?: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" {...base} {...p}>
    <path d="m8 1.9 1.85 3.75 4.15.6-3 2.92.7 4.13L8 11.36 4.3 13.3l.7-4.13-3-2.92 4.15-.6L8 1.9Z" />
  </svg>
);
export const ShareIcon = (p: P) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...base} {...p}>
    <path d="M8 10V2.5M5 5.2 8 2.3l3 2.9" />
    <path d="M3.2 8.5v4.3c0 .5.4.9.9.9h7.8c.5 0 .9-.4.9-.9V8.5" />
  </svg>
);
export const ExternalIcon = (p: P) => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...base} {...p}>
    <path d="M9.5 2.5h4v4M13.5 2.5 7.8 8.2" />
    <path d="M12 9.5v3.3c0 .4-.3.7-.7.7H3.2a.7.7 0 0 1-.7-.7V4.7c0-.4.3-.7.7-.7h3.3" />
  </svg>
);
export const FlipIcon = (p: P) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...base} {...p}>
    <path d="M5 2.5v11M2.5 5 5 2.5 7.5 5M11 13.5v-11M8.5 11 11 13.5 13.5 11" />
  </svg>
);
export const GearIcon = (p: P) => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...base} {...p}>
    <circle cx="8" cy="8" r="2.2" />
    <path d="M8 1.8v1.6M8 12.6v1.6M14.2 8h-1.6M3.4 8H1.8M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1M12.4 12.4l-1.1-1.1M4.7 4.7 3.6 3.6" />
  </svg>
);
export const GlobeIcon = (p: P) => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" {...base} {...p}>
    <circle cx="8" cy="8" r="6" />
    <path d="M2 8h12M8 2c1.8 1.8 2.6 3.8 2.6 6S9.8 12.2 8 14C6.2 12.2 5.4 10.2 5.4 8S6.2 3.8 8 2Z" />
  </svg>
);
