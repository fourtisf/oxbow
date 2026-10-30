/** Outbound links (Solana mainnet). */
export const links = {
  account: (a: string) => `https://solscan.io/account/${a}`,
  token: (mint: string) => `https://solscan.io/token/${mint}`,
  tx: (sig: string) => `https://solscan.io/tx/${sig}`,
  dexscreener: (mint: string) => `https://dexscreener.com/solana/${mint}`,
  birdeye: (mint: string) => `https://birdeye.so/token/${mint}?chain=solana`,
  shareOnX: (text: string, url: string) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
};

/** The production domain, used when NEXT_PUBLIC_SITE_URL isn't set (server side). */
export const DEFAULT_SITE_URL = 'https://oxbowflow.com';

/** Absolute site URL for share links and metadata. */
export function siteUrl(path = ''): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : DEFAULT_SITE_URL);
  return base.replace(/\/$/, '') + path;
}

export const walletHref = (address: string) => `/wallet/${address}`;
export const tokenHref = (mint: string) => `/token/${mint}`;
