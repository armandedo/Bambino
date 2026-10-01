import type { NextConfig } from 'next';

const config: NextConfig = {
  // Served under /admin as its own deployment, so staff code never ships in the customer bundle.
  basePath: '/admin',
  transpilePackages: ['@bambino/ui', '@bambino/api-client', '@bambino/utils', '@bambino/types'],
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

export default config;
