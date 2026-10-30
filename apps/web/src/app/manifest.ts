import type { MetadataRoute } from 'next';
import { getT } from '@/i18n/server';

/** Install metadata: name, colors and the brand icon (public/brand, built by scripts/brand-logo.py). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Oxbow',
    short_name: 'Oxbow',
    description: getT().meta.description,
    start_url: '/',
    display: 'standalone',
    background_color: '#03060C',
    theme_color: '#03060C',
    icons: [
      { src: '/brand/oxbow-icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/brand/oxbow-icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/brand/oxbow-icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
