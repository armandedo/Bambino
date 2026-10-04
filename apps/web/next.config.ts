import type { NextConfig } from 'next';

const config: NextConfig = {
  // Internal packages ship TypeScript source; Next compiles them.
  transpilePackages: [
    '@bambino/validation',
    '@bambino/config',
    '@bambino/ui',
    '@bambino/api-client',
    '@bambino/utils',
    '@bambino/types',
  ],
  poweredByHeader: false,
  // Earlier addresses keep working (emails, bookmarks, the tests) after the move to the spec's route names.
  async redirects() {
    return [
      { source: '/subscriptions', destination: '/plans', permanent: true },
      { source: '/size-finder', destination: '/fit', permanent: true },
      { source: '/account/settings', destination: '/account', permanent: true },
      { source: '/account/baby', destination: '/dashboard/baby', permanent: true },
      { source: '/account/exchanges', destination: '/dashboard/exchange', permanent: true },
      { source: '/account/orders/:path*', destination: '/dashboard/orders/:path*', permanent: true },
      {
        source: '/account/subscription/:path*',
        destination: '/dashboard/subscription/:path*',
        permanent: true,
      },
      { source: '/product/:slug', destination: '/shop/:slug', permanent: true },
    ];
  },
  reactStrictMode: true,
};

export default config;
