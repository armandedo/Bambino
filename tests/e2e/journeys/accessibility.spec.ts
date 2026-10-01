import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from '../support/a11y';

const PUBLIC_PAGES = [
  '/',
  '/shop',
  '/shop/seed-footed-romper',
  '/subscriptions',
  '/size-finder',
  '/login',
  '/register',
  '/forgot-password',
  '/design',
];

for (const path of PUBLIC_PAGES) {
  test(`${path} has no WCAG A/AA violations @mobile`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('main')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expectNoA11yViolations(page);
  });
}
