import { expect, test } from '@playwright/test';

test.use({ javaScriptEnabled: false });

/** Headlines are in the server HTML and visible before (or without) any JavaScript. */
for (const path of ['/', '/shop', '/delivery-returns', '/fit']) {
  test(`${path} shows its headline without JavaScript`, async ({ page }) => {
    await page.goto(path);
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
    await expect(heading).toHaveCSS('opacity', '1');
  });
}

test('the home page shows products and lets a shopper browse by age and category without JavaScript', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('All clothes');
  const products = page.getByRole('main').locator('article');
  expect(await products.count()).toBeGreaterThan(0);
  const first = products.first().getByRole('link').first();
  await expect(first).toBeVisible();
  await expect(first).toHaveAttribute('href', /^\/shop\/.+/);

  // The age and category rows are plain links, so they work before any script runs.
  const ages = page.getByRole('navigation', { name: 'Age groups', exact: true });
  await expect(ages.getByRole('link', { name: /^All ages/ })).toHaveAttribute('aria-current', 'page');
  await ages.getByRole('link', { name: /^Baby/ }).click();
  await expect(page).toHaveURL(/\/shop\?age=baby$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Baby clothes');
  await expect(
    page.getByRole('navigation', { name: 'Age groups', exact: true }).getByRole('link', { name: /^Baby/ }),
  ).toHaveAttribute('aria-current', 'page');

  const categories = page.getByRole('navigation', { name: 'Categories', exact: true }).getByRole('link');
  expect(await categories.count()).toBeGreaterThan(1);
  const category = categories.nth(1);
  const name = (await category.textContent())?.trim() ?? '';
  await category.click();
  await expect(page).toHaveURL(/age=baby&category=.+/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);

  // Filters are a plain GET form: sorting applies with the Apply button.
  const filters = page.getByRole('form', { name: 'Filter and sort' });
  await filters.getByRole('combobox', { name: 'Sort by' }).selectOption({ index: 1 });
  await filters.getByRole('button', { name: 'Apply' }).click();
  await expect(page).toHaveURL(/sort=.+/);
  expect(new URL(page.url()).searchParams.get('age')).toBe('baby');
});
