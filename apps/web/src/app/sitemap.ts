import type { MetadataRoute } from 'next';
import { api } from '@/lib/api';
import { siteUrl } from '@/lib/links';

// Rebuilt hourly so new pools are picked up without a deploy.
export const revalidate = 3600;

/** Static pages plus every listed pool (up to 1,000, most traded first). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const pages = ['', '/explore', '/create', '/docs', '/status', '/terms', '/privacy', '/risk'].map((p) => ({
    url: siteUrl(p || '/'),
    lastModified: now,
    changeFrequency: p === '' || p === '/explore' ? ('hourly' as const) : ('weekly' as const),
  }));
  const pools: MetadataRoute.Sitemap = [];
  let cursor: string | undefined;
  for (let i = 0; i < 10; i++) {
    const page = await api.pools({ sort: 'vol', limit: 100, cursor });
    for (const p of page.items) pools.push({ url: siteUrl('/pool/' + p.address), lastModified: now, changeFrequency: 'hourly' });
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return [...pages, ...pools];
}
