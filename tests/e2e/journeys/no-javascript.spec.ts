import { expect, test } from '@playwright/test';

test.use({ javaScriptEnabled: false });

/** Headlines and calls to action are in the server HTML and visible before (or without) any JavaScript. */
for (const path of ['/', '/how-it-works', '/fit']) {
  test(`${path} shows its headline without JavaScript`, async ({ page }) => {
    await page.goto(path);
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
    await expect(heading).toHaveCSS('opacity', '1');
  });
}

test('the home page calls to action work without JavaScript', async ({ page }) => {
  await page.goto('/');
  const cta = page
    .getByRole('main')
    .getByRole('link', { name: /Shop new arrivals/ })
    .first();
  await expect(cta).toBeVisible();
  await expect(cta).toHaveCSS('opacity', '1');
  // The hero and the closing panel both carry this call to action, so take the first (hero) one.
  await expect(
    page
      .getByRole('main')
      .getByRole('link', { name: /Need a hand with sizing/ })
      .first(),
  ).toBeVisible();
});
