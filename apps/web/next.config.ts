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
  reactStrictMode: true,
};

export default config;
