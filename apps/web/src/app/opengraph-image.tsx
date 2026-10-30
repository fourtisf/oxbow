import { getT } from '@/i18n/server';
import { OG_SIZE, siteOgImage } from '@/lib/og';

export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'Oxbow: follow smart money on Solana';

export default function Image() {
  const t = getT();
  return siteOgImage('Follow smart money on Solana', t.home.lede);
}
