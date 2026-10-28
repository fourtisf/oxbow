import { daysUntil, isAddress, signed, usd, venueInfo } from '@oxbow/shared';
import { getT } from '@/i18n/server';
import { api } from '@/lib/api';
import { logoData, OG_SIZE, poolOgImage, siteOgImage } from '@/lib/og';

export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'Oxbow pool';

/** Share card for /pool/[address]: pair, price, 24h change and liquidity label. */
export default async function Image({ params }: { params: { address: string } }) {
  const t = getT('en');
  const p = isAddress(params.address) ? await api.pool(params.address) : null;
  if (!p) return siteOgImage('Stock-paired pools on Solana', t.home.lede);
  const lp = p.lp;
  const status =
    lp.status === 'BURNED'
      ? t.lp.burned
      : lp.status === 'LOCKED'
        ? t.lp.locked(Math.round(lp.unlockAt ? daysUntil(lp.unlockAt) : 0))
        : lp.status === 'PARTIAL'
          ? t.lp.partial(lp.lockedPct)
          : t.lp.unlocked;
  const [baseLogo, quoteLogo] = await Promise.all([logoData(p.base.logoUri), logoData(p.quote.logoUri)]);
  return poolOgImage({
    pair: `${p.base.symbol}/${p.quote.symbol}`,
    baseLogo,
    quoteLogo,
    quoteSquare: !!p.quote.brand?.stock,
    name: t.home.pairedWith(p.base.name, p.quote.name),
    price: usd(p.priceUsd),
    change: p.change24h,
    changeText: signed(p.change24h),
    status,
    statusTone: lp.status === 'BURNED' ? 'ice' : lp.status === 'LOCKED' ? 'up' : lp.status === 'PARTIAL' ? 'amber' : 'down',
    venue: venueInfo(p.venue).label,
  });
}
