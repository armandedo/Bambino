import { expect, test } from '@playwright/test';
import type { ProductDetail } from '../../../packages/api-client/src/operations/catalogue';
import { customerApi } from '../support/api';
import { expectNoHorizontalScroll } from '../support/ui';

// Image rendering has its own live checks; isolate control contracts from image-host latency.
test.beforeEach(async ({ page }) => {
  await page.route('**/_next/image*', (route) => route.abort());
});

test('retail collections, persistent favourites and navigation work @mobile', async ({ page }) => {
  await page.route('**/graphql', async (route) => {
    const headers = {
      'access-control-allow-origin': new URL(process.env.E2E_WEB_URL ?? 'http://localhost:3000').origin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type,x-bambino-client',
    };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const body = route.request().postDataJSON() as { operationName: string };
    expect(body.operationName).toBe('Me');
    await route.fulfill({ json: { data: { me: null } }, headers });
  });
  await page.goto('/');
  await page.locator('[data-storefront-ready="true"]').waitFor();
  await page.getByRole('button', { name: 'Next collection', exact: true }).click();
  await expect(page.locator('h1')).toContainText('Dream big.');
  await page.getByRole('button', { name: 'Previous collection', exact: true }).click();
  const save = page.getByRole('button', { name: /^Save / }).first();
  const productName = (await save.getAttribute('aria-label'))?.slice(5) ?? '';
  expect(productName).not.toBe('');
  await save.click();
  const favourites = page.getByRole('button', { name: 'Your favourites, 1 saved', exact: true });
  await favourites.click();
  await expect(page.getByRole('dialog')).toContainText(productName);
  await page.keyboard.press('Escape');
  await expect(favourites).toBeFocused();
  await page.reload();
  await expect(favourites).toBeVisible();
  if (test.info().project.name === 'mobile') {
    await page.getByRole('button', { name: 'Open shopping menu' }).click();
    await expect(page.getByRole('dialog')).toContainText('Find their little stage');
    await page.keyboard.press('Escape');
  } else {
    await page.locator('summary').filter({ hasText: 'Shop by age' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('details.retail-mega')).toHaveAttribute('open', '');
    await page.keyboard.press('Escape');
    await expect(page.locator('details.retail-mega')).not.toHaveAttribute('open', '');
  }
  await page.getByRole('link', { name: 'Bag, 0 items', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Sign in to see your bag');
  await page.keyboard.press('Escape');
  await expectNoHorizontalScroll(page);
  const search = page.getByRole('search', { name: 'Search catalogue' });
  await search.getByRole('searchbox').fill('romper');
  await search.getByRole('button', { name: 'Search products' }).click();
  await expect(page).toHaveURL(/\/shop\?q=romper/);
});

/** Controlled responses exercise the existing client contracts without orders or payment calls. */
test('retail size selection, bag drawer, cart updates and delivery quoting keep their contracts @mobile', async ({
  page,
}) => {
  const { products } = await customerApi(page)<{ products: { edges: { node: ProductDetail }[] } }>(
    '{ products(filter: { oneTimeEligible: true, inStockOnly: true }, first: 1) { edges { node { id slug name brand description material sustainabilityInfo careInstructions subscriptionEligible oneTimeEligible category { id name slug } images { id url altText } priceFrom { amount currency } variants { id sku color inStock price { amount currency } size { code label sortOrder } } } } } }',
  );
  const product = products.edges[0]?.node;
  const variant = product?.variants.find((item) => item.inStock);
  if (!product || !variant) throw new Error('A purchasable product is required for the UI contract check');
  const money = (amount: number) => ({ amount, currency: variant.price.currency });
  let quantity = 0;
  const mutationNames: string[] = [];
  const quotes: string[] = [];
  const cart = () => ({
    id: 'ui-test-cart',
    itemCount: quantity,
    subtotal: money(variant.price.amount * quantity),
    items: quantity
      ? [
          {
            id: 'ui-test-line',
            quantity,
            lineTotal: money(variant.price.amount * quantity),
            variant,
            product: { id: product.id, slug: product.slug, name: product.name, images: product.images },
          },
        ]
      : [],
  });
  await page.route('**/graphql', async (route) => {
    const cors = {
      'access-control-allow-origin':
        route.request().headers().origin ??
        new URL(process.env.E2E_WEB_URL ?? 'http://localhost:3000').origin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type,x-bambino-client',
    };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const body = route.request().postDataJSON() as {
      operationName: string;
      variables: Record<string, unknown>;
    };
    const operation = body.operationName;
    let data: unknown;
    if (operation === 'Me')
      data = {
        me: {
          id: 'ui-test-viewer',
          email: 'retail-ui@seed.test',
          emailVerified: false,
          phone: null,
          firstName: 'Aline',
          lastName: 'Test',
          preferredLocale: 'en-RW',
          roles: [],
          permissions: [],
          addresses: [
            {
              id: 'ui-test-address',
              label: 'Home',
              recipientName: 'Aline Test',
              phone: '+250788123456',
              countryCode: 'RW',
              region: 'Kigali City',
              district: 'Gasabo',
              sector: 'Kimihurura',
              street: null,
              directions: null,
              isDefault: true,
            },
          ],
        },
      };
    else if (operation === 'MyCart') data = { myCart: cart() };
    else if (operation === 'AddToCart') {
      expect(body.variables).toMatchObject({ variantId: variant.id, quantity: 1 });
      mutationNames.push(operation);
      quantity += 1;
      data = { addToCart: cart() };
    } else if (operation === 'UpdateCartItem') {
      expect(body.variables.itemId).toBe('ui-test-line');
      mutationNames.push(operation);
      quantity = Number(body.variables.quantity);
      data = { updateCartItem: cart() };
    } else if (operation === 'RemoveFromCart') {
      mutationNames.push(operation);
      quantity = 0;
      data = { removeFromCart: cart() };
    } else if (operation === 'DeliveryOptions')
      data = {
        deliveryOptions: [
          {
            code: 'standard',
            name: 'Standard test delivery',
            fee: money(1000),
            estimatedDaysMin: 1,
            estimatedDaysMax: 2,
          },
          {
            code: 'express',
            name: 'Express test delivery',
            fee: money(2000),
            estimatedDaysMin: 0,
            estimatedDaysMax: 1,
          },
        ],
      };
    else if (operation === 'CheckoutPreview') {
      const input = body.variables.input as { shippingAddressId: string; deliveryOptionCode: string };
      expect(input.shippingAddressId).toBe('ui-test-address');
      quotes.push(input.deliveryOptionCode);
      const shipping = input.deliveryOptionCode === 'express' ? 2000 : 1000;
      data = {
        checkoutPreview: {
          totals: {
            subtotal: cart().subtotal,
            discount: money(0),
            creditApplied: money(0),
            shipping: money(shipping),
            tax: money(0),
            total: money(cart().subtotal.amount + shipping),
          },
          promotionError: null,
          availableCredit: money(0),
          payOnDelivery: { available: false, providers: [], message: 'UI test' },
        },
      };
    } else throw new Error(`Unexpected request in read-only checkout UI test: ${operation}`);
    await route.fulfill({ json: { data }, headers: cors });
  });
  await page.goto(`/shop/${product.slug}`);
  await page.locator('[data-storefront-ready="true"]').waitFor();
  await expect(page.getByRole('button', { name: 'Choose a size', exact: true })).toBeDisabled();
  const radio = page.locator(`input[name="variant"][value="${variant.id}"]`);
  if (await page.locator('input[name="color"]').count())
    await page
      .locator('label')
      .filter({ has: page.locator(`input[name="color"][value="${variant.color}"]`) })
      .click();
  await page.locator('label').filter({ has: radio }).click();
  await page.getByRole('button', { name: 'Add to cart', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(product.name);
  await page.keyboard.press('Escape');
  await page.goto('/cart');
  await page.getByRole('button', { name: 'Increase quantity' }).click();
  await expect(page.getByText('Subtotal (2 items)', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Decrease quantity' }).click();
  await expect(page.getByText('Subtotal (1 item)', { exact: true })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.getByRole('link', { name: 'Go to checkout', exact: true }).click();
  await expect(page).toHaveURL(/\/checkout$/, { timeout: 60_000 });
  await expect(page.getByRole('heading', { name: 'Checkout', exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Place order and pay' })).toBeDisabled();
  await page.getByRole('radio', { name: /Standard test delivery/ }).check();
  await expect(page.getByRole('button', { name: 'Place order and pay' })).toBeEnabled();
  await page.getByRole('radio', { name: /Express test delivery/ }).check();
  await expect(page.getByText(/RF\s2,000/, { exact: true })).toBeVisible();
  expect(quotes.at(-1)).toBe('express');
  expect(mutationNames).toEqual(['AddToCart', 'UpdateCartItem', 'UpdateCartItem']);
  await expectNoHorizontalScroll(page);
});
