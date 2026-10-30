import type { MetadataRoute } from 'next';
import { api } from '@/lib/api';
import { siteUrl } from '@/lib/links';

// Rebuilt hourly so newly featured wallets are picked up without a deploy.
export const revalidate = 3600;

/** Static pages plus featured wallets (user-added ones stay out of search). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const pages = ['', '/wallets', '/docs', '/status', '/terms', '/privacy', '/risk'].map((p) => ({
    url: siteUrl(p || '/'),
    lastModified: now,
    changeFrequency: p === '' || p === '/wallets' ? ('hourly' as const) : ('weekly' as const),
  }));
  const wallets = await api.wallets().catch(() => []);
  return [...pages, ...wallets.filter((w) => w.featured).map((w) => ({ url: siteUrl('/wallet/' + w.address), lastModified: now, changeFrequency: 'hourly' as const }))];
}
