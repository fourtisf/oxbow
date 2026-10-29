/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@oxbow/shared', '@oxbow/solana'],
  experimental: {
    // Next 14 needs this for src/instrumentation.ts (server error reporting).
    instrumentationHook: true,
  },
};

export default nextConfig;
