import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import nextConfig from '../next.config';
import { proxy } from '../proxy';
import { contentSecurityPolicy, createNonce, originOf, staticSecurityHeaders } from './security-headers';

/** The CSP as a map of directive → sources. */
function parse(csp: string): Map<string, string[]> {
  return new Map(
    csp.split('; ').map((d) => {
      const [name = '', ...sources] = d.split(' ');
      return [name, sources];
    }),
  );
}

const base = {
  nonce: 'abc123',
  apiUrl: 'https://api.bambino.rw/graphql',
  storageUrl: 'https://media.bambino.rw/products',
};

describe('contentSecurityPolicy', () => {
  it('only runs scripts carrying the nonce, and nothing from other origins', () => {
    const csp = parse(contentSecurityPolicy({ ...base, isDev: false }));
    expect(csp.get('script-src')).toEqual(["'self'", "'nonce-abc123'", "'strict-dynamic'"]);
    expect(csp.get('default-src')).toEqual(["'self'"]);
    expect(csp.get('object-src')).toEqual(["'none'"]);
    expect(csp.get('base-uri')).toEqual(["'self'"]);
    expect(csp.get('form-action')).toEqual(["'self'"]);
    expect(csp.get('frame-ancestors')).toEqual(["'none'"]);
    expect(csp.has('upgrade-insecure-requests')).toBe(true);
  });

  it('allows the API origin for requests and the storage origin for images', () => {
    const csp = parse(contentSecurityPolicy({ ...base, isDev: false }));
    expect(csp.get('connect-src')).toEqual(["'self'", 'https://api.bambino.rw']);
    expect(csp.get('img-src')).toContain('https://media.bambino.rw');
    // Stock photos are self-hosted: no third-party image host.
    expect(csp.get('img-src')).toEqual(["'self'", 'blob:', 'data:', 'https://media.bambino.rw']);
  });

  it('does not upgrade requests to https when the API is on plain http (a local production build)', () => {
    const csp = contentSecurityPolicy({ ...base, isDev: false, apiUrl: 'http://localhost:4000/graphql' });
    expect(parse(csp).has('upgrade-insecure-requests')).toBe(false);
  });

  it('adds eval and drops the https upgrade only in development', () => {
    const csp = parse(
      contentSecurityPolicy({
        nonce: 'n',
        isDev: true,
        apiUrl: 'http://localhost:4000/graphql',
        storageUrl: 'http://localhost:4000/media',
      }),
    );
    expect(csp.get('script-src')).toContain("'unsafe-eval'");
    expect(csp.has('upgrade-insecure-requests')).toBe(false);
    // One entry when the API and storage share an origin.
    expect(csp.get('connect-src')).toEqual(["'self'", 'http://localhost:4000']);
  });

  it('ignores missing or malformed origins instead of writing them into the policy', () => {
    const csp = contentSecurityPolicy({
      nonce: 'n',
      isDev: false,
      apiUrl: undefined,
      storageUrl: 'not a url',
    });
    expect(parse(csp).get('connect-src')).toEqual(["'self'"]);
    expect(csp).not.toContain('not a url');
    expect(csp).not.toContain('undefined');
  });
});

describe('createNonce', () => {
  it('is different every time', () => {
    expect(createNonce()).not.toBe(createNonce());
  });
});

describe('originOf', () => {
  it('keeps the scheme, host and port only', () => {
    expect(originOf('http://localhost:4000/graphql?x=1')).toBe('http://localhost:4000');
  });
});

describe('staticSecurityHeaders', () => {
  it('sends HSTS in production only', () => {
    const keys = (production: boolean) => staticSecurityHeaders(production).map((h) => h.key);
    expect(keys(true)).toContain('Strict-Transport-Security');
    expect(keys(false)).not.toContain('Strict-Transport-Security');
    for (const key of [
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Permissions-Policy',
      'X-Frame-Options',
    ]) {
      expect(keys(false)).toContain(key);
    }
  });
});

describe('next.config headers', () => {
  it('applies the security headers to every path', async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const all = rules.find((r) => r.source === '/:path*');
    expect(all?.headers.map((h) => h.key)).toEqual(
      expect.arrayContaining(['X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy']),
    );
  });
});

describe('proxy', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('sets the same nonce CSP on the request (for Next to read) and the response, fresh each time', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.bambino.rw/graphql');
    const first = proxy(new NextRequest('https://bambino.rw/shop'));
    const second = proxy(new NextRequest('https://bambino.rw/shop'));
    const csp = first.headers.get('Content-Security-Policy') ?? '';
    expect(csp).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
    expect(csp).toContain('https://api.bambino.rw');
    expect(first.headers.get('x-middleware-request-content-security-policy')).toBe(csp);
    expect(second.headers.get('Content-Security-Policy')).not.toBe(csp);
  });
});
