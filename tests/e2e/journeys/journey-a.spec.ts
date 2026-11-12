import { expect, test } from '@playwright/test';
import { customerApi } from '../support/api';
import { addShoppingItem, chooseDeliveryAndPlaceOrder, guardTestPayments } from '../support/shopping';
import { expectNoHorizontalScroll, payWithApprovingTestWallet, registerThroughUi } from '../support/ui';

test('journey A: choose a size, update the bag, select delivery and pay with a test wallet @mobile', async ({
  page,
}) => {
  test.setTimeout(420_000);
  await guardTestPayments(page);
  await registerThroughUi(page, 'shopping', '/shop');
  const { product, variant } = await addShoppingItem(page);
  await page.goto('/cart', { waitUntil: 'domcontentloaded' });
  const quantity = page.getByRole('group', { name: `Quantity of ${product.name}` });
  const updated = page.waitForResponse(
    (response) => response.request().postData()?.includes('UpdateCartItem') === true,
  );
  await quantity.getByRole('button', { name: 'Increase quantity' }).click();
  const result = await (await updated).json();
  if (result.errors?.length) {
    expect(result.errors[0].extensions?.reason).toBe('OUT_OF_STOCK');
    await expect(page.getByRole('alert').filter({ hasText: 'Only 1 left in stock.' })).toBeVisible();
    await expect(page.getByText('Subtotal (1 item)', { exact: true })).toBeVisible();
  } else {
    expect(result.data.updateCartItem.itemCount).toBe(2);
    await expect(page.getByText('Subtotal (2 items)', { exact: true })).toBeVisible();
    await quantity.getByRole('button', { name: 'Decrease quantity' }).click();
    await expect(page.getByText('Subtotal (1 item)', { exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByText('Your cart is empty', { exact: true })).toBeVisible();
  await addShoppingItem(page);
  await page.goto('/cart', { waitUntil: 'domcontentloaded' });
  await expectNoHorizontalScroll(page);
  const deliveryCode = await chooseDeliveryAndPlaceOrder(page);
  await payWithApprovingTestWallet(page);
  await expect(page).toHaveURL(/\/dashboard\/orders\/[^/?]+\?placed=1/, { timeout: 90_000 });
  await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  const orderId = new URL(page.url()).pathname.split('/').at(-1);
  const { order, myCart, mySubscriptions } = await customerApi(page)<{
    order: {
      type: string;
      status: string;
      items: { quantity: number; sku: string }[];
      deliveryOption: { code: string };
      payments: { provider: string; status: string }[];
    };
    myCart: { itemCount: number } | null;
    mySubscriptions: unknown[];
  }>(
    `query ($id: ID!) { order(id: $id) { type status items { quantity sku } deliveryOption { code } payments { provider status } } myCart { itemCount } mySubscriptions { id } }`,
    { id: orderId },
  );
  expect(order.type).toBe('ONE_TIME');
  expect(order.status).toBe('PAID');
  expect(order.items).toEqual([expect.objectContaining({ quantity: 1, sku: variant.sku })]);
  expect(order.deliveryOption.code).toBe(deliveryCode);
  expect(order.payments).toEqual([expect.objectContaining({ provider: 'MOCK', status: 'SUCCEEDED' })]);
  expect(myCart?.itemCount ?? 0).toBe(0);
  expect(mySubscriptions).toEqual([]);
});
