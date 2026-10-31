/** https URL from env, or null while the account doesn't exist yet. */
const link = (v: string | undefined) => (v && /^https:\/\/\S+$/.test(v.trim()) ? v.trim() : null);

/** Oxbow's official X account; NEXT_PUBLIC_X_URL overrides it. */
const OFFICIAL_X = 'https://x.com/oxbowflow';

/** Official social accounts (NEXT_PUBLIC_X_URL, NEXT_PUBLIC_TELEGRAM_URL). Unset ones show as "Soon". */
export const social = {
  x: link(process.env.NEXT_PUBLIC_X_URL) ?? OFFICIAL_X,
  telegram: link(process.env.NEXT_PUBLIC_TELEGRAM_URL),
};

/** "@handle" from the X profile URL, for the twitter:site card tag. */
export const xHandle = (() => {
  const m = social.x?.match(/^https:\/\/(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/?$/);
  return m ? `@${m[1]}` : undefined;
})();

export const NAV = [{ href: '/' }, { href: '/wallets' }, { href: '/following' }, { href: '/docs' }] as const;
