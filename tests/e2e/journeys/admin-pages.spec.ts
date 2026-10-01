import { type Page, expect, test } from '@playwright/test';
import { expectNoA11yViolations } from '../support/a11y';

const ADMIN_URL = process.env.E2E_ADMIN_URL ?? 'http://localhost:3001/admin';

const PAGES = [
  { path: '/', heading: 'Dashboard' },
  { path: '/analytics', heading: 'Analytics' },
  { path: '/orders', heading: 'Orders' },
  { path: '/deliveries', heading: 'Deliveries' },
  { path: '/returns', heading: 'Returns & inspection' },
  { path: '/exchanges', heading: 'Exchanges' },
  { path: '/garments', heading: 'Garments' },
  { path: '/customers', heading: 'Customers' },
  { path: '/subscriptions', heading: 'Subscriptions & plans' },
  { path: '/payments', heading: 'Payments' },
  { path: '/products', heading: 'Products' },
  { path: '/inventory', heading: 'Inventory' },
  { path: '/promotions', heading: 'Promotions' },
  { path: '/users', heading: 'Staff & roles' },
  { path: '/audit-log', heading: 'Audit log' },
  { path: '/settings', heading: 'Settings' },
];

async function signIn(page: Page) {
  await page.goto(`${ADMIN_URL}/login`);
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Email').fill(process.env.E2E_STAFF_EMAIL ?? 'admin@seed.test');
  await page
    .getByLabel('Password')
    .fill(process.env.E2E_STAFF_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD ?? '');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible({ timeout: 60_000 });
}

/** Every admin page loads its data and has no WCAG A/AA violations, as a super admin. */
test('every admin page loads and passes accessibility checks', async ({ page }) => {
  test.setTimeout(600_000);
  await signIn(page);
  for (const { path, heading } of PAGES) {
    await test.step(path, async () => {
      await page.goto(`${ADMIN_URL}${path === '/' ? '' : path}`);
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible({ timeout: 60_000 });
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(/Could not load/)).toHaveCount(0);
      await expectNoA11yViolations(page);
    });
  }
});

test('customers cannot use the admin dashboard', async ({ page }) => {
  await page.goto(`${ADMIN_URL}/orders`);
  // Signed out: sent to the staff sign-in page.
  await expect(page).toHaveURL(/\/admin\/login/, { timeout: 60_000 });
});
