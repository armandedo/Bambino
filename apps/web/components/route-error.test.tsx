import { ApiError } from '@bambino/api-client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DashboardLoading, ProductLoading, ShopLoading } from './page-loading';
import { RouteError, type RouteErrorValue, errorReference } from './route-error';

const noop = () => undefined;

describe('errorReference', () => {
  it('uses the API request id for an API error', () => {
    expect(errorReference(new ApiError('boom', 'INTERNAL', 'req-42'))).toBe('req-42');
  });

  it('falls back to the digest Next logs on the server', () => {
    const error: RouteErrorValue = Object.assign(new Error('An error occurred'), { digest: '1234567' });
    expect(errorReference(error)).toBe('1234567');
    expect(errorReference(new Error('plain'))).toBeUndefined();
  });
});

describe('RouteError', () => {
  it('is announced, shows the reference and offers a retry', () => {
    const html = renderToStaticMarkup(
      <RouteError error={new ApiError('boom', 'INTERNAL', 'req-42')} retry={noop} what="your orders" />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('We couldn&#x27;t show your orders');
    expect(html).toContain('req-42');
    expect(html).toMatch(/<button[^>]*>Try again<\/button>/);
  });

  it('says when Bambino cannot be reached, and never shows the raw error message', () => {
    const html = renderToStaticMarkup(
      <RouteError
        error={new ApiError('fetch failed: ECONNREFUSED', 'NETWORK', undefined)}
        retry={noop}
        what="x"
      />,
    );
    expect(html).toContain('can’t reach Bambino');
    expect(html).not.toContain('ECONNREFUSED');
  });
});

describe('loading screens', () => {
  it.each([
    ['shop', ShopLoading, 'Loading products'],
    ['product', ProductLoading, 'Loading product'],
    ['dashboard', DashboardLoading, 'Loading your account'],
  ])('%s announces one loading status', (_name, Loading, label) => {
    const html = renderToStaticMarkup(<Loading />);
    expect(html).toContain('aria-busy="true"');
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html).toContain(label);
  });
});
