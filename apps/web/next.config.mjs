const live = ['1', 'true'].includes((process.env.NEXT_PUBLIC_LIVE_DATA ?? '').trim().toLowerCase());
const apiUrl = (process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@oxbow/shared', '@oxbow/solana'],
  experimental: {
    // Next 14 needs this for src/instrumentation.ts (server error reporting).
    instrumentationHook: true,
  },
  // In production nginx sends /api to the API before Next sees it. Without nginx
  // (local runs, e2e) Next forwards it. Checked before dynamic routes, so the
  // catch-all 404 page doesn't swallow API paths.
  async rewrites() {
    return { afterFiles: live ? [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }] : [] };
  },
};

export default nextConfig;
