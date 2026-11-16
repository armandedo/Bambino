import { resolve } from 'node:path';
import type { NextConfig } from 'next';

const config: NextConfig = {
  // Served under /admin as its own deployment, so staff code never ships in the customer bundle.
  basePath: '/admin',
  transpilePackages: [
    '@bambino/ui',
    '@bambino/api-client',
    '@bambino/config',
    '@bambino/utils',
    '@bambino/types',
  ],
  poweredByHeader: false,
  // A self-contained server for the container image (Dockerfile); traced from the monorepo root.
  output: 'standalone',
  outputFileTracingRoot: resolve(process.cwd(), '../..'),
  reactStrictMode: true,
  // Same as the website: on unrelated hosts the dashboard calls the API through its own origin
  // (NEXT_PUBLIC_API_URL=<admin>/admin/api/graphql), so the staff session cookie is first-party.
  async rewrites() {
    const target = process.env.API_PROXY_TARGET;
    return target ? [{ source: '/api/graphql', destination: target }] : [];
  },
  // The dashboard lives under /admin; the bare host goes there.
  async redirects() {
    return [{ source: '/', destination: '/admin', basePath: false, permanent: false }];
  },
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
