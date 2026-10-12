import { randomUUID } from 'node:crypto';
import { schema } from '@bambino/database';
import { eq } from '@bambino/database/orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cashOnDeliveryAvailability } from '../domain/cash-on-delivery';
import { type TestApp, createTestApp, errorCode, errorReason } from '../testing/test-app';

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp({ catalogue: true });
}, 120_000);

afterAll(async () => {
  await t.close();
});

const kigali = {
  recipientName: 'Aline Uwase',
  phone: '+250788123456',
  countryCode: 'RW',
  region: 'Kigali',
  district: 'Gasabo',
  sector: 'Kimironko',
};

const PRODUCT = 'query ($slug: String!) { product(slug: $slug) { variants { id } } }';
const ADD = 'mutation ($id: ID!, $q: Int) { addToCart(variantId: $id, quantity: $q) { id itemCount } }';
const PREVIEW = `query ($input: CheckoutInput!) { checkoutPreview(input: $input) {
  totals { total { amount } } cashOnDelivery { available message } } }`;
const CREATE_ORDER = `mutation ($input: CreateOrderInput!) { createOrder(input: $input) { id status
  totals { total { amount } } } }`;
const CONFIRM = `mutation ($input: ConfirmCashOnDeliveryInput!) { confirmCashOnDelivery(input: $input) {
  id status paidAt delivery { status } payments { provider status amount { amount } } } }`;
const CANCEL = 'mutation ($id: ID!) { cancelOrder(id: $id) { id status } }';
const STATUS =
  'mutation ($id: ID!, $status: OrderStatus!) { adminUpdateOrderStatus(orderId: $id, status: $status) { status } }';
const DELIVERY =
  'mutation ($input: DeliveryUpdateInput!) { adminUpdateDelivery(input: $input) { status deliveredAt } }';
const PAY =
  'mutation ($input: InitiatePaymentInput!) { initiatePayment(input: $input) { id status provider } }';

async function shopper() {
  const account = await t.registerCustomer();
  const address = await t.gql(
    'mutation ($input: AddressInput!) { createAddress(input: $input) { id } }',
    { input: kigali },
    { token: account.accessToken },
  );
  return { ...account, addressId: (address.data?.createAddress as { id: string }).id };
}

let variantIndex = 0;

function checkoutInput(customer: { addressId: string }) {
  return { shippingAddressId: customer.addressId, deliveryOptionCode: 'SEED-STANDARD' };
}

/** Puts one variant in the cart (rotating variants so seed stock lasts) and returns the preview input. */
async function fillCart(customer: Awaited<ReturnType<typeof shopper>>) {
  const product = (await t.gql(PRODUCT, { slug: 'seed-footed-romper' })).data?.product as {
    variants: { id: string }[];
  };
  const variant = product.variants[variantIndex++ % product.variants.length];
  if (!variant) throw new Error('no variant');
  const added = await t.gql(ADD, { id: variant.id, q: 1 }, { token: customer.accessToken });
  if (added.errors) throw new Error(JSON.stringify(added.errors));
  return variant.id;
}

async function placeOrder(customer: Awaited<ReturnType<typeof shopper>>) {
  const variantId = await fillCart(customer);
  const response = await t.gql(
    CREATE_ORDER,
    { input: { idempotencyKey: randomUUID(), checkout: checkoutInput(customer) } },
    { token: customer.accessToken },
  );
  if (response.errors) throw new Error(JSON.stringify(response.errors));
  return {
    variantId,
    order: response.data?.createOrder as {
      id: string;
      status: string;
      totals: { total: { amount: number } };
    },
  };
}

async function stockOf(variantId: string) {
  const [item] = await t.db
    .select()
    .from(schema.inventoryItems)
    .where(eq(schema.inventoryItems.variantId, variantId));
  return item;
}

describe('the rule', () => {
  const policy = { enabled: true, maxOrderAmount: 100_000, orderTypes: ['ONE_TIME'] as const };

  it('accepts a shop order within the limit', () => {
    expect(cashOnDeliveryAvailability({ type: 'ONE_TIME', totalAmount: 100_000 }, policy)).toEqual({
      available: true,
    });
  });

  it('refuses an order above the limit, a subscription order and a free order', () => {
    expect(cashOnDeliveryAvailability({ type: 'ONE_TIME', totalAmount: 100_001 }, policy)).toMatchObject({
      available: false,
      code: 'OVER_LIMIT',
    });
    expect(
      cashOnDeliveryAvailability({ type: 'SUBSCRIPTION_CYCLE', totalAmount: 5_000 }, policy),
    ).toMatchObject({
      available: false,
      code: 'ORDER_TYPE',
    });
    expect(cashOnDeliveryAvailability({ type: 'ONE_TIME', totalAmount: 0 }, policy)).toMatchObject({
      available: false,
      code: 'NOTHING_TO_PAY',
    });
  });

  it('can be switched off', () => {
    expect(
      cashOnDeliveryAvailability({ type: 'ONE_TIME', totalAmount: 5_000 }, { ...policy, enabled: false }),
    ).toMatchObject({ available: false, code: 'DISABLED' });
  });
});

describe('pay on delivery', () => {
  it('is offered in the checkout preview for a small cart', async () => {
    const customer = await shopper();
    await fillCart(customer);
    const preview = await t.gql(PREVIEW, { input: checkoutInput(customer) }, { token: customer.accessToken });
    expect(preview.errors).toBeUndefined();
    expect(preview.data?.checkoutPreview).toMatchObject({
      cashOnDelivery: { available: true, message: null },
    });
  });

  it('confirms an order: committed stock, a delivery, and a waiting cash payment for the stored total', async () => {
    const customer = await shopper();
    const { order, variantId } = await placeOrder(customer);
    expect(order.status).toBe('PENDING_PAYMENT');
    const before = await stockOf(variantId);

    const key = randomUUID();
    const confirmed = await t.gql(
      CONFIRM,
      { input: { orderId: order.id, idempotencyKey: key } },
      { token: customer.accessToken },
    );
    expect(confirmed.errors).toBeUndefined();
    expect(confirmed.data?.confirmCashOnDelivery).toMatchObject({
      id: order.id,
      status: 'CONFIRMED',
      paidAt: null,
      delivery: { status: 'PENDING' },
      payments: [
        { provider: 'CASH_ON_DELIVERY', status: 'PENDING', amount: { amount: order.totals.total.amount } },
      ],
    });
    // The reservation became a sale: one fewer on hand and one fewer reserved.
    const after = await stockOf(variantId);
    expect(after?.quantityOnHand).toBe((before?.quantityOnHand ?? 0) - 1);
    expect(after?.quantityReserved).toBe((before?.quantityReserved ?? 0) - 1);

    // The same key again returns the same order and creates no second payment.
    const again = await t.gql(
      CONFIRM,
      { input: { orderId: order.id, idempotencyKey: key } },
      { token: customer.accessToken },
    );
    expect(again.errors).toBeUndefined();
    const rows = await t.db.select().from(schema.payments).where(eq(schema.payments.orderId, order.id));
    expect(rows).toHaveLength(1);
  });

  it('refuses a second confirmation with a new key, and an order that is not the caller’s', async () => {
    const customer = await shopper();
    const { order } = await placeOrder(customer);
    const first = await t.gql(
      CONFIRM,
      { input: { orderId: order.id, idempotencyKey: randomUUID() } },
      { token: customer.accessToken },
    );
    expect(first.errors).toBeUndefined();
    const second = await t.gql(
      CONFIRM,
      { input: { orderId: order.id, idempotencyKey: randomUUID() } },
      { token: customer.accessToken },
    );
    expect(errorReason(second)).toBe('ORDER_NOT_PAYABLE');

    const stranger = await shopper();
    const { order: theirs } = await placeOrder(stranger);
    const stolen = await t.gql(
      CONFIRM,
      { input: { orderId: theirs.id, idempotencyKey: randomUUID() } },
      { token: customer.accessToken },
    );
    expect(errorCode(stolen)).toBe('NOT_FOUND');
  });

  it('is not available through initiatePayment', async () => {
    const customer = await shopper();
    const { order } = await placeOrder(customer);
    const response = await t.gql(
      PAY,
      {
        input: {
          idempotencyKey: randomUUID(),
          orderId: order.id,
          provider: 'CASH_ON_DELIVERY',
          msisdn: '+250788000001',
        },
      },
      { token: customer.accessToken },
    );
    expect(errorReason(response)).toBe('PROVIDER_NOT_OFFERED');
  });

  it('is not touched by reconciliation, and the cash is collected when the order is delivered', async () => {
    const customer = await shopper();
    const { order } = await placeOrder(customer);
    const confirmed = await t.gql(
      CONFIRM,
      { input: { orderId: order.id, idempotencyKey: randomUUID() } },
      { token: customer.accessToken },
    );
    expect(confirmed.errors).toBeUndefined();

    // Days pass with nothing collected: the job neither expires the payment nor cancels the order.
    t.advanceClock(3 * 24 * 3_600_000);
    await t.app.runJobs();
    const [waiting] = await t.db.select().from(schema.orders).where(eq(schema.orders.id, order.id));
    expect(waiting?.status).toBe('CONFIRMED');
    const [pending] = await t.db.select().from(schema.payments).where(eq(schema.payments.orderId, order.id));
    expect(pending).toMatchObject({ provider: 'CASH_ON_DELIVERY', status: 'PENDING' });

    // Staff sessions are created after the clock jump so their tokens are still valid.
    const ops = await t.registerStaff('OPERATIONS_MANAGER');
    const rider = await t.registerStaff('DELIVERY_STAFF');
    for (const status of ['PROCESSING', 'PACKED', 'READY_FOR_DISPATCH']) {
      const moved = await t.gql(STATUS, { id: order.id, status }, { token: ops.accessToken });
      expect(moved.errors).toBeUndefined();
    }
    const [delivery] = await t.db
      .select()
      .from(schema.deliveries)
      .where(eq(schema.deliveries.orderId, order.id));
    for (const status of ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED']) {
      const moved = await t.gql(
        DELIVERY,
        { input: { deliveryId: delivery?.id, status } },
        { token: rider.accessToken },
      );
      expect(moved.errors).toBeUndefined();
    }

    const [final] = await t.db.select().from(schema.orders).where(eq(schema.orders.id, order.id));
    expect(final?.status).toBe('DELIVERED');
    expect(final?.paidAt).not.toBeNull();
    const [collected] = await t.db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.orderId, order.id));
    expect(collected).toMatchObject({ provider: 'CASH_ON_DELIVERY', status: 'SUCCEEDED' });
    const events = await t.db
      .select()
      .from(schema.orderStatusEvents)
      .where(eq(schema.orderStatusEvents.orderId, order.id))
      .orderBy(schema.orderStatusEvents.createdAt);
    expect(events.map((event) => event.newStatus)).toEqual([
      'PENDING_PAYMENT',
      'CONFIRMED',
      'PROCESSING',
      'PACKED',
      'READY_FOR_DISPATCH',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
    ]);
  });

  it('can be cancelled before it is prepared: stock back, cash payment closed, no refund', async () => {
    const customer = await shopper();
    const { order, variantId } = await placeOrder(customer);
    const placed = await stockOf(variantId);
    const reservedBefore = placed?.quantityReserved ?? 0;
    const onHandBefore = placed?.quantityOnHand ?? 0;
    await t.gql(
      CONFIRM,
      { input: { orderId: order.id, idempotencyKey: randomUUID() } },
      { token: customer.accessToken },
    );

    const cancelled = await t.gql(CANCEL, { id: order.id }, { token: customer.accessToken });
    expect(cancelled.errors).toBeUndefined();
    expect(cancelled.data?.cancelOrder).toMatchObject({ status: 'CANCELLED' });

    const [payment] = await t.db.select().from(schema.payments).where(eq(schema.payments.orderId, order.id));
    expect(payment).toMatchObject({ provider: 'CASH_ON_DELIVERY', status: 'CANCELLED' });
    const refunds = await t.db.select().from(schema.refunds).where(eq(schema.refunds.orderId, order.id));
    expect(refunds).toHaveLength(0);

    const after = await stockOf(variantId);
    // On hand is back to what it was; the order's reservation is gone, so the item is available again.
    expect(reservedBefore).toBeGreaterThan(0);
    expect(after?.quantityOnHand).toBe(onHandBefore);
    expect(after?.quantityReserved).toBe(reservedBefore - 1);
  });
});
