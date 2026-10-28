import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/links';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/restricted', '/dashboard'] },
    sitemap: siteUrl('/sitemap.xml'),
  };
}
