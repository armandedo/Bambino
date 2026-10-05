import { expect, test } from '@playwright/test';

/**
 * The website's Content-Security-Policy (apps/web/proxy.ts) must not block the site itself: Next's scripts carry
 * the per-request nonce, and photos and API calls come from allowed origins. Any violation fails the page.
 * Run against a production build (`pnpm --filter @bambino/web build && start`) to check the production policy.
 */
const PAGES = ['/', '/shop', '/shop/seed-footed-romper', '/plans', '/fit', '/login', '/register'];

for (const path of PAGES) {
  test(`${path} sends the security headers and breaks no CSP rule`, async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { cspViolations: string[] };
      w.cspViolations = [];
      document.addEventListener('securitypolicyviolation', (e) =>
        w.cspViolations.push(`${e.effectiveDirective} blocked ${e.blockedURI || 'inline'}`),
      );
    });
    const response = await page.goto(path);
    const headers = response?.headers() ?? {};
    expect(headers['content-security-policy']).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('same-origin');
    expect(headers['permissions-policy']).toContain('camera=()');

    await expect(page.getByRole('main')).toBeVisible();
    await page.waitForLoadState('networkidle');
    const violations = await page.evaluate(
      () => (window as unknown as { cspViolations: string[] }).cspViolations,
    );
    expect(violations).toEqual([]);
    // Every image that started loading finished (none blocked).
    const broken = await page.evaluate(() =>
      [...document.images]
        .filter((img) => img.complete && img.currentSrc && img.naturalWidth === 0)
        .map((img) => img.currentSrc),
    );
    expect(broken).toEqual([]);
  });
}

test('each response gets a different nonce', async ({ request }) => {
  const nonce = async () =>
    /'nonce-([^']+)'/.exec((await request.get('/')).headers()['content-security-policy'] ?? '')?.[1];
  const [a, b] = [await nonce(), await nonce()];
  expect(a).toBeTruthy();
  expect(a).not.toBe(b);
});
