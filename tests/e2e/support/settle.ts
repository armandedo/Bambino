import { type Page, type Request, test } from '@playwright/test';

/**
 * Waits for a page to go quiet on the network, without letting one chatty page fail a test for three minutes.
 *
 * `waitForLoadState('networkidle')` has no upper bound beyond the whole test timeout. On a CI runner a single
 * request that never finishes (or a poll) made one login-page test wait 180 seconds twice. This waits at most
 * `timeout` ms; if the page is still busy it carries on, and it records which requests were still open, in the
 * log and as a test annotation, so the cause can be fixed instead of hidden.
 *
 * Call `trackRequests(page)` before `page.goto`, so every request is seen from the start.
 */
export function trackRequests(page: Page) {
  const open = new Map<Request, string>();
  page.on('request', (request) => open.set(request, `${request.method()} ${request.url()}`));
  page.on('requestfinished', (request) => open.delete(request));
  page.on('requestfailed', (request) => open.delete(request));

  return {
    /** Resolves true when the network went idle, false when it did not within `timeout`. */
    async settle(timeout = 10_000): Promise<boolean> {
      try {
        await page.waitForLoadState('networkidle', { timeout });
        return true;
      } catch {
        const unfinished = [...open.values()].slice(0, 10);
        const description =
          unfinished.length > 0 ? unfinished.join(' | ') : 'none open (activity kept restarting)';
        console.warn(`network not idle after ${timeout} ms on ${page.url()}; open requests: ${description}`);
        test.info().annotations.push({ type: 'network-not-idle', description });
        return false;
      }
    },
  };
}
