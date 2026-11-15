import { type Page, expect, test } from '@playwright/test';
import { customerApi, staffApi } from '../support/api';
import { addShoppingItem, chooseDeliveryAndPlaceOrder, guardTestPayments } from '../support/shopping';
import { signInThroughUi } from '../support/ui';

/**
 * What happens to an order when a payment does not simply succeed: the customer cancels, or approves on their
 * phone after our request has expired. Run against the mock provider only. The late wallet approves 15 seconds
 * after the request expires, and reconciliation looks at a closed payment once it is two minutes old, so these
 * journeys need PAYMENT_EXPIRY_MINUTES=1 and a short RECONCILE_INTERVAL_SECONDS on the API (set in CI).
 */
const ADMIN_URL = process.env.E2E_ADMIN_URL ?? 'http://localhost:3001/admin';
const LATE_WALLET = '+250780000004';

interface OrderState {
  id: string;
  orderNumber: string;
  status: string;
  delivery: { status: string } | null;
  payments: { provider: string; status: string }[];
}
const ORDER =
  'query ($id: ID!) { order(id: $id) { id orderNumber status delivery { status } payments { provider status } } }';

// The seeded customer (parent@seed.test) shops in every journey here. Signing in, instead of registering, keeps a
// run inside the API's limit of five registrations in ten minutes from one address. Each journey places its own
// order.
test.describe.configure({ mode: 'serial' });
const CUSTOMER_EMAIL = process.env.E2E_CUSTOMER_EMAIL ?? 'parent@seed.test';
const CUSTOMER_PASSWORD = process.env.E2E_CUSTOMER_PASSWORD ?? process.env.SEED_CUSTOMER_PASSWORD;
let page: Page;

test.beforeAll(async ({ browser }) => {
  if (!CUSTOMER_PASSWORD) {
    throw new Error(
      'Set SEED_CUSTOMER_PASSWORD (or E2E_CUSTOMER_PASSWORD) and run `pnpm --filter @bambino/api db:seed`.',
    );
  }
  page = await (await browser.newContext()).newPage();
  await guardTestPayments(page);
  await signInThroughUi(page, CUSTOMER_EMAIL, CUSTOMER_PASSWORD);
});

test.afterAll(async () => {
  await page.context().close();
});

/** Puts one item in the bag and places the order, stopping on the payment step. */
async function orderAwaitingPayment() {
  await addShoppingItem(page);
  await page.goto('/cart', { waitUntil: 'domcontentloaded' });
  await chooseDeliveryAndPlaceOrder(page);
  const { myOrders } = await customerApi(page)<{ myOrders: { edges: { node: { id: string } }[] } }>(
    '{ myOrders(first: 1) { edges { node { id } } } }',
  );
  const id = myOrders.edges[0]?.node.id;
  if (!id) throw new Error('the placed order was not found');
  return id;
}

const readOrder = async (id: string) => (await customerApi(page)<{ order: OrderState }>(ORDER, { id })).order;

/** Pays with the wallet that approves late and waits until our own request has expired, unanswered. */
async function payLateAndLetItExpire() {
  await page.locator(`input[name="mock-wallet"][value="${LATE_WALLET}"]`).check();
  await page.getByRole('button', { name: /^Pay (?!on delivery)/ }).click();
  const failed = page.getByRole('alert').filter({ hasText: 'The payment did not go through' });
  await expect(failed).toBeVisible({ timeout: 120_000 });
  await expect(failed).toContainText('expired before it was approved');
}

async function cancelOnOrderPage(orderId: string) {
  await page.goto(`/dashboard/orders/${orderId}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Cancel this order' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Nothing has been charged');
  await dialog.getByRole('button', { name: 'Cancel order', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Cancelled', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel this order' })).toHaveCount(0);
}

async function adminSignIn(adminPage: Page, email: string, password: string) {
  await adminPage.goto(`${ADMIN_URL}/login`);
  await adminPage.waitForLoadState('networkidle');
  await adminPage.getByLabel('Email').fill(email);
  await adminPage.getByLabel('Password').fill(password);
  await adminPage.getByRole('button', { name: 'Sign in' }).click();
}

test('an unpaid order can be cancelled and then needs no payment', async () => {
  test.setTimeout(300_000);
  const orderId = await orderAwaitingPayment();
  expect((await readOrder(orderId)).status).toBe('PENDING_PAYMENT');

  await cancelOnOrderPage(orderId);
  await expect(page.getByText('Payment needed', { exact: true })).toHaveCount(0);
  const order = await readOrder(orderId);
  expect(order.status).toBe('CANCELLED');
  expect(order.payments).toEqual([]);
  expect(order.delivery).toBeNull();
});

test('a payment approved after the request expired still pays the waiting order, once', async () => {
  test.setTimeout(420_000);
  const orderId = await orderAwaitingPayment();
  await payLateAndLetItExpire();
  // Our request has expired and the customer was told so, but the order is still waiting and keeps its stock.
  expect(await readOrder(orderId)).toMatchObject({
    status: 'PENDING_PAYMENT',
    payments: [{ provider: 'MOCK', status: 'EXPIRED' }],
  });

  // The wallet approves a little later. Nobody presses anything: reconciliation asks the provider and applies it.
  await expect
    .poll(async () => (await readOrder(orderId)).status, { timeout: 240_000, intervals: [5_000] })
    .toBe('PAID');
  const order = await readOrder(orderId);
  expect(order.payments).toEqual([{ provider: 'MOCK', status: 'SUCCEEDED' }]);
  expect(order.delivery).not.toBeNull();

  await page.goto(`/dashboard/orders/${orderId}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Payment needed', { exact: true })).toHaveCount(0);
});

test('a payment approved after the order was cancelled goes to staff review, which only payment staff can act on', async ({
  browser,
}) => {
  test.setTimeout(600_000);
  const staff = await staffApi();
  const orderId = await orderAwaitingPayment();
  await payLateAndLetItExpire();
  await cancelOnOrderPage(orderId);

  interface Review {
    id: string;
    reason: string;
    open: boolean;
    resolution: string | null;
    payment: { providerReference: string; unapplied: boolean; payment: { id: string; status: string } };
    order: { id: string } | null;
  }
  const REVIEWS = `query ($open: Boolean) { adminPaymentReviews(open: $open, page: { first: 50 }) { items {
    id reason open resolution payment { providerReference unapplied payment { id status } } order { id } } } }`;
  const reviewFor = async (open: boolean) =>
    (
      await staff.call<{ adminPaymentReviews: { items: Review[] } }>(REVIEWS, { open })
    ).adminPaymentReviews.items.find((item) => item.order?.id === orderId);

  // The money arrives for an order that can no longer take it: recorded, not fulfilled, and handed to staff.
  await expect
    .poll(async () => Boolean(await reviewFor(true)), { timeout: 240_000, intervals: [5_000] })
    .toBe(true);
  const review = await reviewFor(true);
  expect(review).toMatchObject({
    reason: 'ORDER_CANCELLED',
    open: true,
    payment: { unapplied: true, payment: { status: 'SUCCEEDED' } },
  });
  const order = await readOrder(orderId);
  expect(order.status).toBe('CANCELLED');
  expect(order.delivery).toBeNull();
  expect(order.payments).toEqual([{ provider: 'MOCK', status: 'SUCCEEDED' }]);
  const REFUNDS = '{ adminRefunds(page: { first: 1 }) { totalCount } }';
  const refundsBefore = (await staff.call<{ adminRefunds: { totalCount: number } }>(REFUNDS)).adminRefunds
    .totalCount;

  // A customer cannot read reviews.
  await expect(customerApi(page)(REVIEWS, { open: true })).rejects.toThrow(/FORBIDDEN/);

  // Staff without a payment permission cannot read reviews or open the Payments page. The shopper is given a
  // warehouse role for this check and loses it again afterwards.
  const { me } = await customerApi(page)<{ me: { id: string } }>('{ me { id } }');
  const ROLE = 'mutation ($id: ID!) { adminAssignRole(userId: $id, roleKey: "INVENTORY_MANAGER") { id } }';
  const NO_ROLE = 'mutation ($id: ID!) { adminRevokeRole(userId: $id, roleKey: "INVENTORY_MANAGER") { id } }';
  await staff.call(ROLE, { id: me.id });
  try {
    await expect(customerApi(page)(REVIEWS, { open: true })).rejects.toThrow(/FORBIDDEN/);
    const warehouseContext = await browser.newContext();
    const warehousePage = await warehouseContext.newPage();
    await adminSignIn(warehousePage, CUSTOMER_EMAIL, CUSTOMER_PASSWORD ?? '');
    await expect(warehousePage.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible({
      timeout: 60_000,
    });
    await expect(warehousePage.getByRole('link', { name: 'Payments', exact: true })).toHaveCount(0);
    await warehousePage.goto(`${ADMIN_URL}/payments`);
    await expect(warehousePage.getByText('Not available for your role')).toBeVisible({ timeout: 60_000 });
    await expect(warehousePage.getByRole('heading', { name: /^Needs review/ })).toHaveCount(0);
    await warehouseContext.close();
  } finally {
    await staff.call(NO_ROLE, { id: me.id });
  }

  // Payment staff see the case with its order, reference and reason, and record the outcome.
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await adminSignIn(
    admin,
    process.env.E2E_STAFF_EMAIL ?? 'admin@seed.test',
    process.env.E2E_STAFF_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD ?? '',
  );
  await expect(admin.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible({ timeout: 60_000 });
  await admin.goto(`${ADMIN_URL}/payments`);
  const section = admin.getByRole('region', { name: /^Needs review/ });
  await expect(section).toBeVisible({ timeout: 60_000 });
  await expect(section).toContainText('does not move any money');
  const card = section.getByRole('listitem').filter({ hasText: order.orderNumber });
  await expect(card).toContainText('after the order was cancelled');
  await expect(card).toContainText(review?.payment.providerReference ?? 'missing reference');
  await expect(card).toContainText('It does not send a refund');
  await card.getByLabel('Outcome').selectOption('REFUNDED');
  await card.getByLabel('What was done').fill('Refunded to the wallet through the provider portal');
  await card.getByRole('button', { name: 'Record outcome' }).click();
  await expect(card).toHaveCount(0);
  // The payment itself is unchanged by that: still received, still not applied to the order.
  const paymentRow = admin
    .getByRole('listitem')
    .filter({ hasText: review?.payment.providerReference ?? 'missing reference' })
    .filter({ hasText: 'Not applied to the order' });
  await expect(paymentRow).toContainText(/succeeded/i);
  await adminContext.close();

  // Recording the outcome closed the case and moved no money: no refund was created by it.
  const closed = await reviewFor(false);
  expect(closed).toMatchObject({ open: false, resolution: 'REFUNDED', payment: { unapplied: true } });
  expect(await reviewFor(true)).toBeUndefined();
  expect((await staff.call<{ adminRefunds: { totalCount: number } }>(REFUNDS)).adminRefunds.totalCount).toBe(
    refundsBefore,
  );
  expect((await readOrder(orderId)).status).toBe('CANCELLED');
  await staff.dispose();
});
