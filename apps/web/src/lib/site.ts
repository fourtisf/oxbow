/** Site-wide links. Social URLs are set by env; empty ones fall back to "#" like the prototype. */
export const social = {
  x: process.env.NEXT_PUBLIC_X_URL || '#',
  telegram: process.env.NEXT_PUBLIC_TELEGRAM_URL || '#',
  discord: process.env.NEXT_PUBLIC_DISCORD_URL || '#',
};

export const NAV = [
  { href: '/explore', label: 'Explore', short: 'Explore' },
  { href: '/create', label: 'Create Pool', short: 'Create' },
  { href: '/dashboard', label: 'Dashboard', short: 'Dashboard' },
  { href: '/docs', label: 'Docs', short: 'Docs' },
] as const;
