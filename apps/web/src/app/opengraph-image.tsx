import { getT } from '@/i18n/server';
import { OG_SIZE, siteOgImage } from '@/lib/og';

export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'Oxbow: stock-paired pools on Solana';

export default function Image() {
  const t = getT('en');
  return siteOgImage('Stock-paired pools on Solana', t.home.lede);
}
