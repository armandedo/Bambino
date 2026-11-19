import { expect, test } from '@playwright/test';
import { addShoppingItem, chooseDeliveryAndPlaceOrder, guardTestPayments } from '../support/shopping';
import { payWithApprovingTestWallet, registerThroughUi } from '../support/ui';

test('journey C: a declined test payment can be retried on the same shopping order', async ({ page }) => {
  test.setTimeout(300_000);
  await guardTestPayments(page);
  await registerThroughUi(page, 'retry', '/shop');
  await addShoppingItem(page);
  await page.goto('/cart', { waitUntil: 'domcontentloaded' });
  await chooseDeliveryAndPlaceOrder(page);
  const orderHeading = await page.getByRole('heading', { name: /^Pay for order / }).textContent();
  await page.locator('input[name="mock-wallet"][value="+250780000002"]').check();
  await page.getByRole('button', { name: /^Pay (?!on delivery)/ }).click();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole('heading', { name: /^Pay for order / })).toHaveText(orderHeading ?? '');
  await page.getByRole('button', { name: 'Try again' }).click();
  await payWithApprovingTestWallet(page);
  await expect(page).toHaveURL(/\/dashboard\/orders\/[^/?]+\?placed=1/, { timeout: 90_000 });
  await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible();
});
