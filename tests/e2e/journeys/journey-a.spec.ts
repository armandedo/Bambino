import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from '../support/a11y';
import { staffApi } from '../support/api';
import {
  addAddressThroughUi,
  birthDateMonthsAgo,
  expectNoHorizontalScroll,
  payWithApprovingTestWallet,
  registerThroughUi,
} from '../support/ui';

/**
 * Journey A (docs/07): register → baby profile → sizing → subscribe → checkout → mock payment → order.
 * Every step is performed through the website, as a parent would.
 */
test('journey A: a new parent subscribes in the recommended size and pays with mobile money @mobile', async ({
  page,
}) => {
  // Make sure tagged garments exist in the sizes this baby will be recommended (shared dev database).
  const staff = await staffApi();
  await staff.stockGarments(['0-3M', '3-6M', '6-9M']);
  await staff.dispose();

  await test.step('register', async () => {
    await registerThroughUi(page, 'journey-a');
    await expect(page.getByRole('heading', { name: 'Tell us about your baby' })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  await test.step('create a baby profile and get a size recommendation', async () => {
    // The fit finder asks one thing at a time.
    await page.getByLabel('Baby’s name or nickname').fill('Keza');
    await page.getByLabel('Date of birth').fill(birthDateMonthsAgo(4));
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('Height (cm)').fill('64');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('Weight (kg)').fill('7');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'How do you like clothes to fit?' })).toBeVisible();
    await page.getByRole('button', { name: 'Get size recommendation' }).click();
    await expect(page.getByText('Recommended size for Keza')).toBeVisible();
    // The UI states how the result was produced and never implies machine learning.
    await expect(page.getByText('Rules-based recommendation')).toBeVisible();
    await expectNoA11yViolations(page);
  });

  await test.step('start a subscription', async () => {
    await page.getByRole('link', { name: 'Build my Bambino box' }).click();
    await expect(page.getByRole('heading', { name: 'Start a subscription' })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expect(page.getByRole('radio', { name: /Keza/ })).toBeChecked();
    await addAddressThroughUi(page);
    await page.getByRole('group', { name: 'Delivery', exact: true }).getByRole('radio').first().check();
    await page.getByRole('button', { name: 'Continue to choose pieces' }).click();
  });

  await test.step('choose pieces in the recommended size', async () => {
    // Creating the subscription reserves stock in one transaction; allow for a cold API right after start-up.
    await expect(page.getByRole('heading', { name: /Choose this month’s pieces/ })).toBeVisible({
      timeout: 45_000,
    });
    const cards = page.locator('label').filter({ has: page.locator('input[type=checkbox]:not([disabled])') });
    await cards.nth(0).click();
    await cards.nth(1).click();
    await expect(page.getByText('2 of', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Save my choice' }).click();
  });

  await test.step('pay with the test wallet and see the subscription start', async () => {
    await expect(page.getByRole('heading', { name: 'Pay for your first period' })).toBeVisible();
    await expectNoA11yViolations(page);
    await payWithApprovingTestWallet(page);
    // Success is shown only after the API reports the provider's confirmation.
    await expect(page).toHaveURL(/\/dashboard\/subscription\?started=1/, { timeout: 60_000 });
    await expect(page.getByText('Your subscription has started')).toBeVisible();
    await expect(page.getByText('Active', { exact: true }).first()).toBeVisible();
  });

  await test.step('the paid order appears in the account', async () => {
    await page.goto('/dashboard/orders');
    const row = page.getByRole('row', { name: /Subscription/ });
    await expect(row).toBeVisible();
    await expect(row.getByText('Paid')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectNoA11yViolations(page);
  });
});
