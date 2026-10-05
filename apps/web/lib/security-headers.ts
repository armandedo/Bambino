/**
 * Security headers for the website. The Content-Security-Policy is built per request by `proxy.ts`, because
 * it carries a fresh nonce; the other headers are static and set in `next.config.ts`.
 *
 * Kept free of Next imports so `next.config.ts` and the tests can load it directly.
 */

/** The origin of a URL, or null when it is missing or not a URL. */
export function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export interface CspOptions {
  nonce: string;
  /** `next dev`: React needs `eval` for its debugging stacks, and the site runs on plain http. */
  isDev: boolean;
  /** The GraphQL endpoint the browser calls (NEXT_PUBLIC_API_URL). */
  apiUrl: string | undefined;
  /** Where product photos are served from (STORAGE_PUBLIC_BASE_URL). */
  storageUrl: string | undefined;
  /** Browser error tracking (NEXT_PUBLIC_SENTRY_DSN); its host may receive reports. */
  errorReportingDsn?: string | undefined;
}

/** The Content-Security-Policy header value for one response. */
export function contentSecurityPolicy({
  nonce,
  isDev,
  apiUrl,
  storageUrl,
  errorReportingDsn,
}: CspOptions): string {
  const api = originOf(apiUrl);
  const reporting = originOf(errorReportingDsn);
  const storage = originOf(storageUrl);
  const directives: [string, ...string[]][] = [
    ['default-src', "'self'"],
    // Only scripts carrying this response's nonce run; 'strict-dynamic' lets them load Next's chunks.
    ['script-src', "'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])],
    // Inline style attributes are needed: React renders `style` props (and the animation library its initial
    // values) as attributes, which a nonce cannot cover. Styles cannot run code.
    ['style-src', "'self'", "'unsafe-inline'"],
    ['img-src', "'self'", 'blob:', 'data:', ...(storage ? [storage] : [])],
    // next/font serves the fonts from this origin.
    ['font-src', "'self'"],
    ['connect-src', "'self'", ...(api ? [api] : []), ...(reporting ? [reporting] : [])],
    ['object-src', "'none'"],
    ['base-uri', "'self'"],
    ['form-action', "'self'"],
    ['frame-ancestors', "'none'"],
  ];
  // Only when the deployment is on https: upgrading a local build would turn calls to the http API into
  // failing https calls.
  if (!isDev && api?.startsWith('https:')) directives.push(['upgrade-insecure-requests']);
  return directives.map((d) => [...new Set(d)].join(' ')).join('; ');
}

/** A random, unguessable nonce for one response. */
export function createNonce(): string {
  return btoa(crypto.randomUUID());
}

/** Headers set on every response by `next.config.ts`. HSTS only in production, where the site is on https. */
export function staticSecurityHeaders(production: boolean): { key: string; value: string }[] {
  return [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    // Same as the admin: other sites learn nothing about which page a parent came from.
    { key: 'Referrer-Policy', value: 'same-origin' },
    // Older browsers that ignore the CSP's frame-ancestors.
    { key: 'X-Frame-Options', value: 'DENY' },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
    },
    ...(production
      ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]
      : []),
  ];
}
