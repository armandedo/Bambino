import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll } from '../support/ui';

test('preview shopping pages show product photos and working collection filters @mobile', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Little outfits.');
  const photos = page.locator('article img');
  expect(await photos.count()).toBeGreaterThan(0);
  await photos.first().scrollIntoViewIfNeeded();
  await expect
    .poll(async () =>
      photos.evaluateAll((images) => images.every((image) => (image as HTMLImageElement).naturalWidth > 0)),
    )
    .toBe(true);
  for (const photo of await photos.all()) await expect(photo).toHaveCSS('object-fit', 'cover');
  await expectNoHorizontalScroll(page);
  await page.goto('/shop');
  const age = page.getByRole('navigation', { name: 'Age groups', exact: true }).getByRole('link').nth(1);
  await age.click();
  await expect(page).toHaveURL(/age=.+/);
  const categories = page.getByRole('navigation', { name: 'Categories', exact: true }).getByRole('link');
  expect(await categories.count()).toBeGreaterThan(1);
  await categories.nth(1).click();
  await expect(page).toHaveURL(/category=.+/);
  expect(new URL(page.url()).searchParams.get('age')).toBeTruthy();
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});
