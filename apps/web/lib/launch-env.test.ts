import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from 'next/constants';
import { afterEach, describe, expect, it, vi } from 'vitest';
import nextConfig from '../next.config';
import { assertLaunchReady, isPreview, launchProblems } from './launch-env';

const ready = {
  NEXT_PUBLIC_MOCK_PAYMENTS: 'false',
  NEXT_PUBLIC_SITE_URL: 'https://bambino.rw',
  NEXT_PUBLIC_API_URL: 'https://api.bambino.rw/graphql',
};

describe('launchProblems', () => {
  it('passes a launch-ready environment', () => {
    expect(launchProblems(ready)).toEqual([]);
    expect(launchProblems({ ...ready, NEXT_PUBLIC_MOCK_PAYMENTS: undefined })).toEqual([]);
  });

  it('refuses mock payments', () => {
    expect(launchProblems({ ...ready, NEXT_PUBLIC_MOCK_PAYMENTS: 'true' })).toEqual([
      expect.stringContaining('NEXT_PUBLIC_MOCK_PAYMENTS'),
    ]);
  });

  it.each([
    ['NEXT_PUBLIC_SITE_URL', 'http://bambino.rw'],
    ['NEXT_PUBLIC_SITE_URL', undefined],
    ['NEXT_PUBLIC_API_URL', 'http://localhost:4000/graphql'],
    ['NEXT_PUBLIC_API_URL', 'not a url'],
  ])('refuses %s=%s', (key, value) => {
    expect(launchProblems({ ...ready, [key]: value })).toEqual([expect.stringContaining(key)]);
  });
});

describe('assertLaunchReady', () => {
  const local = {
    NEXT_PUBLIC_MOCK_PAYMENTS: 'true',
    NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
    NEXT_PUBLIC_API_URL: 'http://localhost:4000/graphql',
  };

  it('fails a production build that is not ready, listing every problem', () => {
    expect(() => assertLaunchReady(local)).toThrow(/MOCK_PAYMENTS[\s\S]*SITE_URL[\s\S]*API_URL/);
  });

  it('allows it only as a preview, which shows the banner', () => {
    const env = { ...local, NEXT_PUBLIC_PREVIEW_BANNER: 'true' };
    expect(isPreview(env)).toBe(true);
    expect(assertLaunchReady(env)).toHaveLength(3);
  });

  it('allows a ready build without the banner', () => {
    expect(isPreview(ready)).toBe(false);
    expect(assertLaunchReady(ready)).toEqual([]);
  });
});

describe('next.config', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('checks the environment for production builds, not the development server', () => {
    vi.stubEnv('NEXT_PUBLIC_MOCK_PAYMENTS', 'true');
    vi.stubEnv('NEXT_PUBLIC_PREVIEW_BANNER', 'false');
    expect(() => nextConfig(PHASE_PRODUCTION_BUILD)).toThrow(/not ready for launch/);
    expect(() => nextConfig(PHASE_DEVELOPMENT_SERVER)).not.toThrow();
  });
});
