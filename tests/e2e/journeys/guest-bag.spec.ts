import { type Page, expect, test } from '@playwright/test';
import { customerApi, staffApi } from '../support/api';
import { expectNoHorizontalScroll, registerThroughUi, signInThroughUi } from '../support/ui';

/**
 * Shopping without an account: a visitor fills a bag that lives on their device, and it joins their account once
 * when they sign in on the way to checkout. Mock payments are never reached here.
 */
const STORAGE_KEY = 'bambino.guest-bag.v1';
const CUSTOMER_EMAIL = process.env.E2E_CUSTOMER_EMAIL ?? 'parent@seed.test';
const CUSTOMER_PASSWORD = process.env.E2E_CUSTOMER_PASSWORD ?? process.env.SEED_CUSTOMER_PASSWORD;

interface CatalogueProduct {
  slug: string;
  name: string;
  variants: { id: string; color: string; inStock: boolean }[];
}

/** Products that can be bought now, read without signing in. */
async function purchasable(page: Page): Promise<CatalogueProduct[]> {
  const { products } = await customerApi(page)<{ products: { edges: { node: CatalogueProduct }[] } }>(
    '{ products(filter: { oneTimeEligible: true, inStockOnly: true }, first: 50) { edges { node { slug name variants { id color inStock } } } } }',
  );
  return products.edges.map((edge) => edge.node).filter((product) => product.variants.some((v) => v.inStock));
}

interface StoredBag {
  items: { variantId: string; quantity: number }[];
  mergeKey: string;
}
const storedBag = (page: Page) =>
  page.evaluate(
    (key) => JSON.parse(window.localStorage.getItem(key) ?? 'null') as StoredBag | null,
    STORAGE_KEY,
  );

/** Chooses a colour and size on the product page with the keyboard, then adds the piece to the bag. */
async function addFromProductPage(page: Page, product: CatalogueProduct) {
  const variant = product.variants.find((v) => v.inStock);
  if (!variant) throw new Error('no stock');
  await page.goto(`/shop/${product.slug}`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-storefront-ready="true"]').waitFor();
  const form = page.getByRole('main');
  await expect(form.getByRole('link', { name: 'Sign in to buy' })).toHaveCount(0);
  await expect(form.getByRole('button', { name: 'Choose a size', exact: true })).toBeDisabled();
  const colour = form.locator(`input[name="color"][value="${variant.color}"]`);
  if (await colour.count()) {
    await colour.focus();
    await page.keyboard.press('Space');
    await expect(colour).toBeChecked();
  }
  const size = form.locator(`input[name="variant"][value="${variant.id}"]`);
  await size.focus();
  await page.keyboard.press('Space');
  await expect(size).toBeChecked();
  const add = form.getByRole('button', { name: 'Add to bag', exact: true });
  await add.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Added to your bag', { exact: true })).toBeVisible();
  const bag = page.getByRole('dialog');
  await expect(bag).toContainText(product.name);
  return { variant, bag };
}

test('a visitor fills, changes and keeps a bag without signing in @mobile', async ({ page }) => {
  const products = await purchasable(page);
  const first = products.find((p) => new Set(p.variants.map((v) => v.color)).size > 1) ?? products[0];
  if (!first) throw new Error('No purchasable test stock');

  const { variant, bag } = await addFromProductPage(page, first);
  // The panel offers checkout through sign-in, and nothing asks for an account before that.
  await expect(bag.getByRole('link', { name: 'Sign in to check out' })).toHaveAttribute(
    'href',
    '/login?next=%2Fcheckout',
  );
  await page.keyboard.press('Escape');
  await expect(bag).toBeHidden();
  await expect(page.getByRole('link', { name: 'Bag, 1 item', exact: true })).toBeVisible();

  // Only the piece and how many are kept on the device: no name, price or personal detail.
  const stored = await storedBag(page);
  expect(stored?.items).toEqual([{ variantId: variant.id, quantity: 1 }]);
  expect(Object.keys(stored ?? {}).sort()).toEqual(['items', 'mergeKey']);
  expect(stored?.mergeKey.length).toBeGreaterThanOrEqual(8);

  // From the grid: a product with a choice to make opens its options instead of asking to sign in.
  await page.goto('/');
  await page.locator('[data-storefront-ready="true"]').waitFor();
  await expect(page.getByRole('link', { name: 'Bag, 1 item', exact: true })).toBeVisible();
  const options = page
    .locator(`button[aria-label^="Choose options: "]:not([aria-label="Choose options: ${first.name}"])`)
    .first();
  const optionsName = ((await options.getAttribute('aria-label')) ?? '').replace(/^Choose options: /, '');
  expect(optionsName).not.toBe('');
  await options.click();
  const panel = page.getByRole('dialog');
  await expect(panel).toContainText(optionsName);
  await expect(panel.getByRole('button', { name: 'Choose a size', exact: true })).toBeDisabled();
  await panel
    .locator('label')
    .filter({ has: page.locator('input[name="variant"]:enabled') })
    .first()
    .click();
  await panel.getByRole('button', { name: 'Add to bag', exact: true }).click();
  await expect(page.getByText('Added to your bag', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText(optionsName);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('link', { name: 'Bag, 2 items', exact: true })).toBeVisible();

  // The bag page works without an account: quantities, removal, and a total from the server.
  await page.goto('/cart', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/cart$/);
  const main = page.getByRole('main');
  await expect(main.getByText('Subtotal (2 items)', { exact: true })).toBeVisible();
  const quantity = main.getByRole('group', { name: `Quantity of ${first.name}` });
  await quantity.getByRole('button', { name: 'Increase quantity' }).focus();
  await page.keyboard.press('Enter');
  await expect(main.getByText('Subtotal (3 items)', { exact: true })).toBeVisible();
  await quantity.getByRole('button', { name: 'Decrease quantity' }).click();
  await expect(main.getByText('Subtotal (2 items)', { exact: true })).toBeVisible();
  await main.getByRole('button', { name: `Remove ${optionsName}`, exact: true }).click();
  await expect(main.getByText('Subtotal (1 item)', { exact: true })).toBeVisible();
  await expect(main.getByRole('link', { name: 'Sign in to check out' })).toHaveAttribute(
    'href',
    '/login?next=%2Fcheckout',
  );
  await expectNoHorizontalScroll(page);

  // A reload, and a visit to another page, keep it.
  await page.reload();
  await expect(main.getByText('Subtotal (1 item)', { exact: true })).toBeVisible();
  await expect(main.getByText(first.name).first()).toBeVisible();
  await page.goto('/shop');
  await expect(page.getByRole('link', { name: 'Bag, 1 item', exact: true })).toBeVisible();
  expect((await storedBag(page))?.items).toEqual([{ variantId: variant.id, quantity: 1 }]);

  // Emptying it leaves nothing behind on the device.
  await page.goto('/cart', { waitUntil: 'domcontentloaded' });
  await main.getByRole('button', { name: `Remove ${first.name}`, exact: true }).click();
  await expect(main.getByText('Your bag is empty', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Bag, 0 items', exact: true })).toBeVisible();
  expect(await storedBag(page)).toBeNull();
});

test('a guest bag follows the stock: a quantity above what is left is reduced and explained', async ({
  page,
}) => {
  const staff = await staffApi();
  const products = await purchasable(page);
  const product = products.at(-1);
  if (!product) throw new Error('No purchasable test stock');
  const { variant } = await addFromProductPage(page, product);
  await page.keyboard.press('Escape');
  await page.goto('/cart', { waitUntil: 'domcontentloaded' });
  const main = page.getByRole('main');
  const more = main.getByRole('group', { name: `Quantity of ${product.name}` }).getByRole('button', {
    name: 'Increase quantity',
  });
  await more.click();
  await expect(main.getByText('Subtotal (2 items)', { exact: true })).toBeVisible();
  await more.click();
  await expect(main.getByText('Subtotal (3 items)', { exact: true })).toBeVisible();

  // Someone else buys most of the stock while the bag sits on the device. No stock was held for it.
  const ADJUST = `mutation ($input: InventoryAdjustmentInput!) { adminAdjustInventory(input: $input) { quantityAvailable } }`;
  const adjust = async (onHandDelta: number) =>
    (
      await staff.call<{ adminAdjustInventory: { quantityAvailable: number } }>(ADJUST, {
        input: {
          variantId: variant.id,
          locationCode: 'KGL-MAIN',
          onHandDelta,
          note: 'journey: guest bag stock check',
        },
      })
    ).adminAdjustInventory.quantityAvailable;
  const before = await adjust(0);
  expect(before).toBeGreaterThanOrEqual(3);
  try {
    expect(await adjust(1 - before)).toBe(1);
    await page.reload();
    await expect(main.getByText('Subtotal (1 item)', { exact: true })).toBeVisible();
    await expect(main.getByRole('status').filter({ hasText: 'Your bag was updated' })).toContainText(
      `Only 1 of ${product.name} left in stock, so your bag has 1.`,
    );
    expect((await storedBag(page))?.items).toEqual([{ variantId: variant.id, quantity: 1 }]);

    // None left at all: the line stays, marked, for the shopper to remove.
    expect(await adjust(-1)).toBe(0);
    await page.reload();
    await expect(main.getByText('No longer in stock. Remove it to check out.')).toBeVisible();
  } finally {
    await adjust(before - (await adjust(0)));
    await staff.dispose();
  }
});

test('a failed sign-in keeps the bag; signing in merges it once and returns to checkout', async ({
  page,
}) => {
  if (!CUSTOMER_PASSWORD) {
    throw new Error(
      'Set SEED_CUSTOMER_PASSWORD (or E2E_CUSTOMER_PASSWORD) and run `pnpm --filter @bambino/api db:seed`.',
    );
  }
  const products = await purchasable(page);
  const product = products[1] ?? products[0];
  if (!product) throw new Error('No purchasable test stock');
  const { variant } = await addFromProductPage(page, product);
  await page.keyboard.press('Escape');
  const stored = await storedBag(page);
  expect(stored?.items).toEqual([{ variantId: variant.id, quantity: 1 }]);

  await page.goto('/cart', { waitUntil: 'domcontentloaded' });
  await page.getByRole('main').getByRole('link', { name: 'Sign in to check out' }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fcheckout$/);
  await page.waitForLoadState('networkidle');

  // The wrong password: nothing is lost.
  await page.getByLabel('Email').fill(CUSTOMER_EMAIL);
  await page.getByLabel('Password').fill('not-the-right-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert').first()).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
  expect(await storedBag(page)).toEqual(stored);
  await expect(page.getByRole('link', { name: 'Bag, 1 item', exact: true })).toBeVisible();

  // The right one: back to checkout, with the bag now in the account and gone from the device.
  await page.getByLabel('Password').fill(CUSTOMER_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/checkout$/, { timeout: 60_000 });
  await expect(page.getByRole('heading', { name: 'Checkout', exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Your bag was added to your account', { exact: true })).toBeVisible();
  await expect.poll(() => storedBag(page)).toBeNull();

  const CART = '{ myCart { itemCount items { id quantity variant { id } } } }';
  interface Cart {
    itemCount: number;
    items: { id: string; quantity: number; variant: { id: string } }[];
  }
  const cart = async () => (await customerApi(page)<{ myCart: Cart }>(CART)).myCart;
  const merged = await cart();
  const line = merged.items.find((item) => item.variant.id === variant.id);
  expect(line?.quantity).toBeGreaterThanOrEqual(1);
  await expect(
    page.getByRole('link', { name: new RegExp(`^Bag, ${merged.itemCount} items?$`) }),
  ).toBeVisible();

  // Sending the same bag again (a retry, another tab) adds nothing.
  const MERGE = `mutation ($input: MergeGuestBagInput!) { mergeGuestBag(input: $input) { alreadyMerged cart { itemCount } } }`;
  const again = await customerApi(page)<{
    mergeGuestBag: { alreadyMerged: boolean; cart: { itemCount: number } };
  }>(MERGE, { input: { mergeKey: stored?.mergeKey, items: stored?.items } });
  expect(again.mergeGuestBag).toEqual({ alreadyMerged: true, cart: { itemCount: merged.itemCount } });
  expect((await cart()).itemCount).toBe(merged.itemCount);

  // Leave the shared test customer's bag as it was found for the other journeys.
  for (const item of (await cart()).items) {
    await customerApi(page)('mutation ($id: ID!) { removeFromCart(itemId: $id) { id } }', { id: item.id });
  }
});

const CART = '{ myCart { itemCount items { id quantity variant { id } } } }';
interface AccountCart {
  itemCount: number;
  items: { id: string; quantity: number; variant: { id: string } }[];
}
const accountCart = async (page: Page) =>
  (await customerApi(page)<{ myCart: AccountCart | null }>(CART)).myCart ?? { itemCount: 0, items: [] };
async function emptyAccountCart(page: Page) {
  for (const item of (await accountCart(page)).items) {
    await customerApi(page)('mutation ($id: ID!) { removeFromCart(itemId: $id) { id } }', { id: item.id });
  }
}
function requireCustomerPassword(): string {
  if (!CUSTOMER_PASSWORD) {
    throw new Error(
      'Set SEED_CUSTOMER_PASSWORD (or E2E_CUSTOMER_PASSWORD) and run `pnpm --filter @bambino/api db:seed`.',
    );
  }
  return CUSTOMER_PASSWORD;
}

test('a merge that fails keeps the bag on the device, and trying again adds it once', async ({ page }) => {
  const password = requireCustomerPassword();
  const products = await purchasable(page);
  const product = products[2] ?? products[0];
  if (!product) throw new Error('No purchasable test stock');
  const { variant } = await addFromProductPage(page, product);
  await page.keyboard.press('Escape');
  const stored = await storedBag(page);
  expect(stored?.items).toEqual([{ variantId: variant.id, quantity: 1 }]);

  // The first merge request never reaches the API (the connection drops); later ones go through untouched.
  const merges: string[] = [];
  await page.route('**/graphql', async (route) => {
    const body = route.request().postDataJSON() as { operationName?: string } | null;
    if (body?.operationName !== 'MergeGuestBag') return route.continue();
    merges.push(merges.length === 0 ? 'dropped' : 'sent');
    if (merges.length === 1) return route.abort('connectionfailed');
    return route.continue();
  });

  await signInThroughUi(page, CUSTOMER_EMAIL, password, '/checkout');
  const failure = page.getByRole('alert').filter({ hasText: 'We couldn’t add the bag from this device' });
  await expect(failure).toBeVisible();
  await expect(failure).toContainText('The items are still saved on this device.');
  // Nothing was lost and nothing was added: the bag is still on the device, and the account has none of it.
  expect(await storedBag(page)).toEqual(stored);
  expect((await accountCart(page)).items.find((item) => item.variant.id === variant.id)).toBeUndefined();
  expect(merges).toEqual(['dropped']);

  await failure.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('Your bag was added to your account', { exact: true })).toBeVisible();
  await expect(failure).toHaveCount(0);
  await expect.poll(() => storedBag(page)).toBeNull();
  expect(merges).toEqual(['dropped', 'sent']);
  const cart = await accountCart(page);
  expect(cart.items.find((item) => item.variant.id === variant.id)?.quantity).toBe(1);
  await expect(page.getByRole('heading', { name: 'Checkout', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Place order and pay' })).toBeVisible();

  // The same bag sent yet again changes nothing.
  const again = await customerApi(page)<{
    mergeGuestBag: { alreadyMerged: boolean; cart: { itemCount: number } };
  }>(
    'mutation ($input: MergeGuestBagInput!) { mergeGuestBag(input: $input) { alreadyMerged cart { itemCount } } }',
    { input: { mergeKey: stored?.mergeKey, items: stored?.items } },
  );
  expect(again.mergeGuestBag).toEqual({ alreadyMerged: true, cart: { itemCount: cart.itemCount } });
  await emptyAccountCart(page);
});

test('signing out leaves the account bag behind: the device shows an empty bag, and the account keeps its own', async ({
  page,
}) => {
  const password = requireCustomerPassword();
  const products = await purchasable(page);
  const product = products[3] ?? products[0];
  const variant = product?.variants.find((v) => v.inStock);
  if (!product || !variant) throw new Error('No purchasable test stock');

  await signInThroughUi(page, CUSTOMER_EMAIL, password);
  await emptyAccountCart(page);
  await customerApi(page)('mutation ($id: ID!) { addToCart(variantId: $id, quantity: 2) { id } }', {
    id: variant.id,
  });
  await page.goto('/cart', { waitUntil: 'domcontentloaded' });
  const main = page.getByRole('main');
  await expect(main.getByText('Subtotal (2 items)', { exact: true })).toBeVisible();
  await expect(main.getByText(product.name).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Bag, 2 items', exact: true })).toBeVisible();

  await page.goto('/account', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 60_000 });

  // Whoever uses this device next sees no trace of that bag: not in the header, the panel, the bag page or storage.
  await expect(page.getByRole('link', { name: 'Bag, 0 items', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Bag, 0 items', exact: true }).click();
  const panel = page.getByRole('dialog');
  await expect(panel).toContainText('Your bag is empty');
  await expect(panel).not.toContainText(product.name);
  await page.keyboard.press('Escape');
  await page.goto('/cart', { waitUntil: 'domcontentloaded' });
  await expect(main.getByText('Your bag is empty', { exact: true })).toBeVisible();
  await expect(main.getByText(product.name)).toHaveCount(0);
  expect(await storedBag(page)).toBeNull();
  // The API agrees: without the session there is no cart to read, and a visitor's bag query knows nothing of it.
  await expect(customerApi(page)(CART)).rejects.toThrow(/UNAUTHENTICATED/);
  await page.reload();
  await expect(main.getByText('Your bag is empty', { exact: true })).toBeVisible();

  // The account still has it.
  await signInThroughUi(page, CUSTOMER_EMAIL, password, '/cart');
  await expect(main.getByText('Subtotal (2 items)', { exact: true })).toBeVisible();
  expect((await accountCart(page)).items).toEqual([
    expect.objectContaining({ quantity: 2, variant: { id: variant.id } }),
  ]);
  await emptyAccountCart(page);
});

test('creating an account with a guest bag brings the bag into the new account', async ({ page }) => {
  const products = await purchasable(page);
  const product = products[4] ?? products[0];
  if (!product) throw new Error('No purchasable test stock');
  const { variant } = await addFromProductPage(page, product);
  await page.keyboard.press('Escape');
  await page.goto('/cart', { waitUntil: 'domcontentloaded' });
  await page
    .getByRole('main')
    .getByRole('group', { name: `Quantity of ${product.name}` })
    .getByRole('button', { name: 'Increase quantity' })
    .click();
  await expect(page.getByRole('main').getByText('Subtotal (2 items)', { exact: true })).toBeVisible();
  const stored = await storedBag(page);
  expect(stored?.items).toEqual([{ variantId: variant.id, quantity: 2 }]);

  await registerThroughUi(page, 'guest-bag', '/checkout');
  await expect(page.getByText('Your bag was added to your account', { exact: true })).toBeVisible();
  await expect.poll(() => storedBag(page)).toBeNull();
  // A new account had nothing: its bag is exactly the guest bag, and checkout can go on.
  expect((await accountCart(page)).items).toEqual([
    expect.objectContaining({ quantity: 2, variant: { id: variant.id } }),
  ]);
  await expect(page.getByRole('heading', { name: 'Checkout', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Bag, 2 items', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Place order and pay' })).toBeVisible();
});
