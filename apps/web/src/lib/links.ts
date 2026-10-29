import { env } from './env';

/**
 * Outbound links. Solscan supports devnet via ?cluster=devnet; DexScreener and
 * Birdeye only index mainnet, so they are hidden on devnet. The "buy a token"
 * link is a template so it can follow Jupiter's current URL scheme without a
 * code change (NEXT_PUBLIC_BUY_TOKEN_URL, `{mint}` is replaced).
 */
const devnet = env.cluster === 'devnet';
const q = devnet ? '?cluster=devnet' : '';

export const links = {
  mainnetOnly: !devnet,
  account: (a: string) => `https://solscan.io/account/${a}${q}`,
  token: (mint: string) => `https://solscan.io/token/${mint}${q}`,
  tx: (sig: string) => `https://solscan.io/tx/${sig}${q}`,
  dexscreener: (pool: string) => `https://dexscreener.com/solana/${pool}`,
  birdeye: (mint: string) => `https://birdeye.so/token/${mint}?chain=solana`,
  buy: (mint: string) => (process.env.NEXT_PUBLIC_BUY_TOKEN_URL || 'https://jup.ag/swap/SOL-{mint}').replace('{mint}', encodeURIComponent(mint)),
  shareOnX: (text: string, url: string) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
};

/** The production domain, used when NEXT_PUBLIC_SITE_URL isn't set (server side). */
export const DEFAULT_SITE_URL = 'https://oxbowflow.com';

/** Absolute site URL for share links and metadata. */
export function siteUrl(path = ''): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : DEFAULT_SITE_URL);
  return base.replace(/\/$/, '') + path;
}
