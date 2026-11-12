import { expect, test } from '@playwright/test';
import { customerApi } from '../support/api';
import { birthDateMonthsAgo, expectNoHorizontalScroll, registerThroughUi } from '../support/ui';

test('journey B: a parent finds a size and shops that size', async ({ page }) => {
  await registerThroughUi(page, 'sizing');
  await page.getByLabel('Baby’s name or nickname').fill('Keza');
  await page.getByLabel('Date of birth').fill(birthDateMonthsAgo(4));
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Height (cm)').fill('64');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Weight (kg)').fill('7');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Get size recommendation' }).click();
  await expect(page.getByText('Recommended size for Keza')).toBeVisible();
  await expect(page.getByText('Rules-based recommendation')).toBeVisible();
  await page.getByRole('link', { name: 'Shop this size', exact: true }).click();
  await expect(page).toHaveURL(/\/shop\?size=.+/);
  const size = new URL(page.url()).searchParams.get('size');
  await expect(page.getByRole('combobox', { name: 'Size', exact: true })).toHaveValue(size ?? '');
  await expectNoHorizontalScroll(page);
  const { subscriptionPlans, mySubscriptions } = await customerApi(page)<{
    subscriptionPlans: unknown[];
    mySubscriptions: unknown[];
  }>('{ subscriptionPlans { id } mySubscriptions { id } }');
  expect(subscriptionPlans).toEqual([]);
  expect(mySubscriptions).toEqual([]);
});

for (const [path, target] of [
  ['/plans', '/shop'],
  ['/subscriptions', '/shop'],
  ['/dashboard/subscription/new', '/shop'],
  ['/account/subscription/old', '/shop'],
  ['/dashboard/wardrobe', '/dashboard/orders'],
  ['/exchange', '/how-it-works'],
  ['/dashboard/exchange', '/how-it-works'],
  ['/sustainability', '/about'],
]) {
  test(`legacy ${path} redirects to ${target}`, async ({ request }) => {
    const response = await request.get(path ?? '/', { maxRedirects: 0 });
    expect(response.status()).toBe(308);
    expect(new URL(response.headers().location ?? '', response.url()).pathname).toBe(target);
  });
}

test('direct subscription activation is disabled on the deployed API', async ({ page }) => {
  await registerThroughUi(page, 'disabled', '/shop');
  const { subscriptionPlans } = await customerApi(page)<{ subscriptionPlans: unknown[] }>(
    '{ subscriptionPlans { id } }',
  );
  expect(subscriptionPlans).toEqual([]);
  const id = crypto.randomUUID();
  for (const [query, variables] of [
    [
      'mutation ($input: CreateSubscriptionInput!) { createSubscription(input: $input) { id } }',
      {
        input: {
          idempotencyKey: crypto.randomUUID(),
          planId: id,
          babyProfileId: id,
          shippingAddressId: id,
          deliveryOptionCode: 'standard',
        },
      },
    ],
    ['mutation ($id: ID!) { resumeSubscription(id: $id) { id } }', { id }],
    ['mutation ($id: ID!) { changeSubscriptionPlan(id: $id, planId: $id) { id } }', { id }],
    ['mutation ($id: ID!) { selectSubscriptionItems(id: $id, variantIds: []) { id } }', { id }],
  ] as const) {
    const response = await page.request.post(
      `${process.env.E2E_API_URL ?? 'http://localhost:4000'}/graphql`,
      {
        headers: { 'x-bambino-client': 'web' },
        data: { query, variables },
      },
    );
    const body = await response.json();
    expect(body.errors?.[0]?.extensions?.reason).toBe('SUBSCRIPTIONS_DISABLED');
  }
});
