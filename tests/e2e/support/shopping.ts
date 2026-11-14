import { expect, type Page } from '@playwright/test';
import { customerApi } from './api';
import { addAddressThroughUi } from './ui';

/** Fail closed before a browser can send anything except a mock-wallet payment. */
export async function guardTestPayments(page: Page) {
  await page.route('**/graphql', async (route) => {
    const body = route.request().postDataJSON() as {
      query?: string;
      variables?: { input?: { provider?: string; msisdn?: string; paymentMethodId?: string } };
    } | null;
    if (body?.query?.includes('initiatePayment')) {
      const input = body.variables?.input;
      if (
        input?.provider !== 'MOCK' ||
        input.paymentMethodId ||
        !['+250780000001', '+250780000002'].includes(input.msisdn ?? '')
      ) {
        await route.abort('blockedbyclient');
        throw new Error('Browser journey blocked a non-test payment');
      }
    }
    await route.continue();
  });
}

/** Use current purchasable stock rather than assuming a particular seed slug exists. */
export async function addShoppingItem(page: Page) {
  const { products } = await customerApi(page)<{
    products: {
      edges: {
        node: {
          slug: string;
          name: string;
          variants: { id: string; sku: string; color: string; inStock: boolean }[];
        };
      }[];
    };
  }>(
    '{ products(filter: { oneTimeEligible: true, inStockOnly: true }, first: 50) { edges { node { slug name variants { id sku color inStock } } } } }',
  );
  const product = products.edges.map((edge) => edge.node).find((p) => p.variants.some((v) => v.inStock));
  const variant = product?.variants.find((v) => v.inStock);
  if (!product || !variant) throw new Error('No purchasable test stock');
  await page.goto(`/shop/${product.slug}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Choose a size', exact: true })).toBeDisabled();
  const color = page.locator('input[name="color"]');
  if (await color.count()) {
    await page
      .locator('label')
      .filter({ has: page.locator(`input[name="color"][value="${variant.color}"]`) })
      .click();
  }
  const chosen = page.locator(`input[name="variant"][value="${variant.id}"]`);
  await expect(chosen).toBeEnabled();
  await page.locator('label').filter({ has: chosen }).click();
  await expect(page.locator(`input[name="variant"][value="${variant.id}"]`)).toBeChecked();
  await page.getByRole('button', { name: 'Add to cart', exact: true }).click();
  await expect(page.getByText('Added to your cart', { exact: true })).toBeVisible();
  return { product, variant };
}

export async function chooseDeliveryAndPlaceOrder(page: Page) {
  await page.getByRole('link', { name: 'Go to checkout', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Place order and pay' })).toBeDisabled();
  await addAddressThroughUi(page);
  const delivery = page.getByRole('group', { name: 'Delivery', exact: true }).getByRole('radio');
  expect(await delivery.count()).toBeGreaterThan(0);
  await delivery.first().check();
  await expect(page.getByRole('button', { name: 'Place order and pay' })).toBeEnabled();
  // Changing delivery must request a new server-authoritative quote.
  if ((await delivery.count()) > 1) {
    const quoted = page.waitForResponse(
      (r) => r.request().postData()?.includes('CheckoutPreview') === true && r.ok(),
    );
    await delivery.nth(1).check();
    await quoted;
    await expect(delivery.nth(1)).toBeChecked();
    await expect(page.getByRole('button', { name: 'Place order and pay' })).toBeEnabled();
  }
  const code = await page.locator('input[name="delivery"]:checked').inputValue();
  await page.getByRole('button', { name: 'Place order and pay' }).click();
  await expect(page.getByRole('heading', { name: /^Pay for order / })).toBeVisible();
  await expect(
    page
      .getByRole('group', { name: 'Mobile money provider', exact: true })
      .getByRole('radio', { name: /^Test wallet / }),
  ).toBeChecked();
  return code;
}
