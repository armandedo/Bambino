import { resolve } from 'node:path';
import type { NextConfig } from 'next';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';
import { assertLaunchReady } from './lib/launch-env';
import { staticSecurityHeaders } from './lib/security-headers';

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
  // A self-contained server for the container image (Dockerfile); traced from the monorepo root.
  output: 'standalone',
  outputFileTracingRoot: resolve(process.cwd(), '../..'),
  // The Content-Security-Policy carries a per-request nonce, so proxy.ts sets it.
  async headers() {
    return [{ source: '/:path*', headers: staticSecurityHeaders(process.env.NODE_ENV === 'production') }];
  },
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

/** Production builds must be launch-ready, or marked as a preview (lib/launch-env.ts). */
export default function nextConfig(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD) {
    const problems = assertLaunchReady(process.env);
    // Build workers load this file again and inherit the environment: warn once.
    if (problems.length > 0 && !process.env.BAMBINO_PREVIEW_WARNED) {
      process.env.BAMBINO_PREVIEW_WARNED = '1';
      for (const problem of problems) console.warn(`Preview build: ${problem}`);
    }
  }
  return config;
}
