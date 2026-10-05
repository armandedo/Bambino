import { type NextRequest, NextResponse } from 'next/server';
import { contentSecurityPolicy, createNonce } from './lib/security-headers';

/**
 * Sets a Content-Security-Policy with a fresh nonce on every page. Next reads the nonce from the request's CSP
 * header and adds it to its own scripts, so only scripts rendered by this server for this response run.
 * Pages must render per request for that (see the root layout).
 */
export function proxy(request: NextRequest) {
  const csp = contentSecurityPolicy({
    nonce: createNonce(),
    isDev: process.env.NODE_ENV === 'development',
    apiUrl: process.env.NEXT_PUBLIC_API_URL,
    storageUrl: process.env.STORAGE_PUBLIC_BASE_URL,
    errorReportingDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: not built assets, optimised images or public files with an extension.
      source: '/((?!_next/static|_next/image|.*\\.[a-z0-9]+$).*)',
      // Link prefetches return data, not HTML.
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
