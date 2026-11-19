import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll } from '../support/ui';

test('shopping pages show every product with a photo or a placeholder, and working age and category filters @mobile', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  // The home page is the catalogue itself.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('All clothes');
  // Every product card shows its photo, or says plainly that there is none yet. A test catalogue may have no
  // photos at all; a photo that is there must load and fill its frame.
  const cards = page.getByRole('main').locator('article');
  expect(await cards.count()).toBeGreaterThan(0);
  for (const card of await cards.all()) {
    const photo = card.locator('img');
    const placeholder = card.locator('[role="img"][aria-label$=": no photo yet"]');
    expect((await photo.count()) + (await placeholder.count()), 'a photo or its placeholder').toBe(1);
  }
  const photos = cards.locator('img');
  if (await photos.count()) {
    await photos.first().scrollIntoViewIfNeeded();
    await expect
      .poll(async () =>
        photos.evaluateAll((images) => images.every((image) => (image as HTMLImageElement).naturalWidth > 0)),
      )
      .toBe(true);
    for (const photo of await photos.all()) await expect(photo).toHaveCSS('object-fit', /cover|contain/);
  }
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
