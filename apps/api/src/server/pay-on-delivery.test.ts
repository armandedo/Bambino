import { randomUUID } from 'node:crypto';
import { schema } from '@bambino/database';
import { eq } from '@bambino/database/orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { payOnDeliveryAvailability } from '../domain/pay-on-delivery';
import { MOCK_WALLETS } from '../providers/payments';
import { type TestApp, createTestApp, errorCode, errorReason } from '../testing/test-app';

/**
 * Pay on delivery is by mobile money, never cash: the customer picks a wallet when ordering, staff ask that wallet
 * for payment when the courier is at the door, and the delivery cannot be completed until the customer approved it.
 */
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
  totals { total { amount } } payOnDelivery { available message providers } } }`;
const CREATE_ORDER = `mutation ($input: CreateOrderInput!) { createOrder(input: $input) { id status
  totals { total { amount } } } }`;
const CONFIRM = `mutation ($input: ConfirmPayOnDeliveryInput!) { confirmPayOnDelivery(input: $input) {
  id status paidAt delivery { status } payments { id } doorPayment { provider maskedMsisdn paid } } }`;
const CANCEL = 'mutation ($id: ID!) { cancelOrder(id: $id) { id status } }';
const STATUS =
  'mutation ($id: ID!, $status: OrderStatus!) { adminUpdateOrderStatus(orderId: $id, status: $status) { status } }';
const DELIVERY =
  'mutation ($input: DeliveryUpdateInput!) { adminUpdateDelivery(input: $input) { status deliveredAt } }';
const PAY =
  'mutation ($input: InitiatePaymentInput!) { initiatePayment(input: $input) { id status provider } }';
const ASK_AT_DOOR =
  'mutation ($id: ID!) { adminRequestDoorPayment(orderId: $id) { id status provider amount { amount } } }';
const PAYMENT = 'query ($id: ID!) { payment(id: $id) { id status } }';

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

/** Puts one variant in the cart (rotating variants so seed stock lasts) and returns its id. */
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

const WALLET = { provider: 'MOCK', msisdn: MOCK_WALLETS.approves };

function confirm(
  customer: { accessToken: string },
  orderId: string,
  wallet: Record<string, unknown> = WALLET,
) {
  return t.gql(CONFIRM, { input: { orderId, ...wallet } }, { token: customer.accessToken });
}

async function orderRow(orderId: string) {
  const [row] = await t.db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  return row;
}

/** Staff take a confirmed order to "out for delivery": the courier is on the way to the door. */
async function sendOut(orderId: string) {
  const ops = await t.registerStaff('OPERATIONS_MANAGER');
  const rider = await t.registerStaff('DELIVERY_STAFF');
  for (const status of ['PROCESSING', 'PACKED', 'READY_FOR_DISPATCH']) {
    const moved = await t.gql(STATUS, { id: orderId, status }, { token: ops.accessToken });
    expect(moved.errors).toBeUndefined();
  }
  const [delivery] = await t.db
    .select()
    .from(schema.deliveries)
    .where(eq(schema.deliveries.orderId, orderId));
  const advance = (status: string) =>
    t.gql(DELIVERY, { input: { deliveryId: delivery?.id, status } }, { token: rider.accessToken });
  for (const status of ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT']) {
    expect((await advance(status)).errors).toBeUndefined();
  }
  return { ops, rider, advance };
}

describe('the rule', () => {
  const policy = { enabled: true, maxOrderAmount: 100_000, orderTypes: ['ONE_TIME'] as const };

  it('accepts a shop order within the limit', () => {
    expect(payOnDeliveryAvailability({ type: 'ONE_TIME', totalAmount: 100_000 }, policy)).toEqual({
      available: true,
    });
  });

  it('refuses an order above the limit, a subscription order and a free order', () => {
    expect(payOnDeliveryAvailability({ type: 'ONE_TIME', totalAmount: 100_001 }, policy)).toMatchObject({
      available: false,
      code: 'OVER_LIMIT',
    });
    expect(
      payOnDeliveryAvailability({ type: 'SUBSCRIPTION_CYCLE', totalAmount: 5_000 }, policy),
    ).toMatchObject({
      available: false,
      code: 'ORDER_TYPE',
    });
    expect(payOnDeliveryAvailability({ type: 'ONE_TIME', totalAmount: 0 }, policy)).toMatchObject({
      available: false,
      code: 'NOTHING_TO_PAY',
    });
  });

  it('has no limit when the policy sets none', () => {
    const unlimited = { ...policy, maxOrderAmount: null };
    expect(payOnDeliveryAvailability({ type: 'ONE_TIME', totalAmount: 5_000_000 }, unlimited)).toEqual({
      available: true,
    });
  });

  it('can be switched off', () => {
    expect(
      payOnDeliveryAvailability({ type: 'ONE_TIME', totalAmount: 5_000 }, { ...policy, enabled: false }),
    ).toMatchObject({ available: false, code: 'DISABLED' });
  });
});

describe('confirming a pay on delivery order', () => {
  it('is offered in the checkout preview, with the wallets that really work', async () => {
    const customer = await shopper();
    await fillCart(customer);
    const preview = await t.gql(PREVIEW, { input: checkoutInput(customer) }, { token: customer.accessToken });
    expect(preview.errors).toBeUndefined();
    // Only the test wallet exists in this app: MTN MoMo and Airtel Money are not integrated, so they are not offered.
    expect(preview.data?.checkoutPreview).toMatchObject({
      payOnDelivery: { available: true, message: null, providers: ['MOCK'] },
    });
  });

  it('confirms with a wallet: stock committed, a delivery created, nothing charged yet', async () => {
    const customer = await shopper();
    const { order, variantId } = await placeOrder(customer);
    const before = await stockOf(variantId);

    const confirmed = await confirm(customer, order.id);
    expect(confirmed.errors).toBeUndefined();
    expect(confirmed.data?.confirmPayOnDelivery).toMatchObject({
      id: order.id,
      status: 'CONFIRMED',
      paidAt: null,
      delivery: { status: 'PENDING' },
      payments: [],
      doorPayment: { provider: 'MOCK', maskedMsisdn: expect.any(String), paid: false },
    });
    // The wallet is kept on the order for the courier's visit, and no payment exists until then.
    const stored = await orderRow(order.id);
    expect(stored).toMatchObject({
      payOnDeliveryProvider: 'MOCK',
      payOnDeliveryMsisdn: MOCK_WALLETS.approves,
    });
    expect(
      await t.db.select().from(schema.payments).where(eq(schema.payments.orderId, order.id)),
    ).toHaveLength(0);

    const after = await stockOf(variantId);
    expect(after?.quantityOnHand).toBe((before?.quantityOnHand ?? 0) - 1);
    expect(after?.quantityReserved).toBe((before?.quantityReserved ?? 0) - 1);

    // Repeating the request returns the same confirmed order and creates no second delivery.
    const again = await confirm(customer, order.id);
    expect(again.errors).toBeUndefined();
    expect(again.data?.confirmPayOnDelivery).toMatchObject({ id: order.id, status: 'CONFIRMED' });
    expect(
      await t.db.select().from(schema.deliveries).where(eq(schema.deliveries.orderId, order.id)),
    ).toHaveLength(1);
  });

  it('refuses a wallet that is not available, and a number that is not a phone number', async () => {
    const customer = await shopper();
    const { order } = await placeOrder(customer);

    const notIntegrated = await confirm(customer, order.id, {
      provider: 'MTN_MOMO',
      msisdn: '+250788000001',
    });
    expect(errorReason(notIntegrated)).toBe('PROVIDER_NOT_OFFERED');
    const badNumber = await confirm(customer, order.id, { provider: 'MOCK', msisdn: 'not a number' });
    expect(badNumber.errors).toBeDefined();
    const noCash = await confirm(customer, order.id, {
      provider: 'CASH_ON_DELIVERY',
      msisdn: '+250788000001',
    });
    expect(noCash.errors).toBeDefined();

    expect((await orderRow(order.id))?.status).toBe('PENDING_PAYMENT');
  });

  it('refuses an order that is not the caller’s', async () => {
    const customer = await shopper();
    const stranger = await shopper();
    const { order: theirs } = await placeOrder(stranger);
    const stolen = await confirm(customer, theirs.id);
    expect(errorCode(stolen)).toBe('NOT_FOUND');
  });

  it('stays confirmed while days pass: the background jobs do not cancel or expire it', async () => {
    const customer = await shopper();
    const { order } = await placeOrder(customer);
    expect((await confirm(customer, order.id)).errors).toBeUndefined();

    t.advanceClock(3 * 24 * 3_600_000);
    await t.app.runJobs();
    expect((await orderRow(order.id))?.status).toBe('CONFIRMED');
  });

  it('is not available through initiatePayment as a cash method', async () => {
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
});

describe('paying at the door', () => {
  it('asks the wallet at the door; delivery completes only after the customer approved', async () => {
    const customer = await shopper();
    const { order } = await placeOrder(customer);
    expect((await confirm(customer, order.id)).errors).toBeUndefined();

    const ops = await t.registerStaff('OPERATIONS_MANAGER');
    const early = await t.gql(ASK_AT_DOOR, { id: order.id }, { token: ops.accessToken });
    expect(errorReason(early)).toBe('ORDER_NOT_AT_DOOR');

    const { advance } = await sendOut(order.id);
    expect((await orderRow(order.id))?.status).toBe('OUT_FOR_DELIVERY');

    // The courier cannot complete the delivery before the money has been approved.
    const blocked = await advance('DELIVERED');
    expect(errorReason(blocked)).toBe('DOOR_PAYMENT_NOT_COLLECTED');
    expect((await orderRow(order.id))?.status).toBe('OUT_FOR_DELIVERY');

    // The wallet is asked for the order's stored total.
    const asked = await t.gql(ASK_AT_DOOR, { id: order.id }, { token: ops.accessToken });
    expect(asked.errors).toBeUndefined();
    const request = asked.data?.adminRequestDoorPayment as {
      id: string;
      status: string;
      provider: string;
      amount: { amount: number };
    };
    expect(request).toMatchObject({
      status: 'PENDING',
      provider: 'MOCK',
      amount: { amount: order.totals.total.amount },
    });
    // Asking again while the request waits returns the same one, never a second charge.
    const twice = await t.gql(ASK_AT_DOOR, { id: order.id }, { token: ops.accessToken });
    expect((twice.data?.adminRequestDoorPayment as { id: string }).id).toBe(request.id);

    // The customer approves on their phone; the app sees it by polling.
    const polled = await t.gql(PAYMENT, { id: request.id }, { token: customer.accessToken });
    expect(polled.data?.payment).toMatchObject({ status: 'SUCCEEDED' });
    const paid = await orderRow(order.id);
    expect(paid?.paidAt).not.toBeNull();
    // Paying at the door records the payment but leaves the order where it is: out for delivery.
    expect(paid?.status).toBe('OUT_FOR_DELIVERY');

    // Asking again now is refused: it is paid.
    const afterPaid = await t.gql(ASK_AT_DOOR, { id: order.id }, { token: ops.accessToken });
    expect(errorReason(afterPaid)).toBe('ALREADY_PAID');

    expect((await advance('DELIVERED')).errors).toBeUndefined();
    const final = await orderRow(order.id);
    expect(final?.status).toBe('DELIVERED');
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

  it('keeps the delivery blocked when the wallet declines, and lets staff ask again', async () => {
    const customer = await shopper();
    const { order } = await placeOrder(customer);
    expect(
      (await confirm(customer, order.id, { provider: 'MOCK', msisdn: MOCK_WALLETS.declines })).errors,
    ).toBeUndefined();
    const { ops, advance } = await sendOut(order.id);

    const first = (await t.gql(ASK_AT_DOOR, { id: order.id }, { token: ops.accessToken })).data
      ?.adminRequestDoorPayment as { id: string };
    const declined = await t.gql(PAYMENT, { id: first.id }, { token: customer.accessToken });
    expect(declined.data?.payment).toMatchObject({ status: 'FAILED' });
    expect((await orderRow(order.id))?.paidAt).toBeNull();
    expect(errorReason(await advance('DELIVERED'))).toBe('DOOR_PAYMENT_NOT_COLLECTED');

    // A failed request can be sent again; it is a new payment, so the history shows both attempts.
    const second = (await t.gql(ASK_AT_DOOR, { id: order.id }, { token: ops.accessToken })).data
      ?.adminRequestDoorPayment as { id: string };
    expect(second.id).not.toBe(first.id);
    const attempts = await t.db.select().from(schema.payments).where(eq(schema.payments.orderId, order.id));
    expect(attempts).toHaveLength(2);
  });

  it('refuses to ask for payment on an order that was paid another way', async () => {
    const customer = await shopper();
    const { order } = await placeOrder(customer);
    const ops = await t.registerStaff('OPERATIONS_MANAGER');
    // Still awaiting online payment, so it is not a pay on delivery order.
    const response = await t.gql(ASK_AT_DOOR, { id: order.id }, { token: ops.accessToken });
    expect(errorReason(response)).toBe('NOT_PAY_ON_DELIVERY');
  });

  it('is only for staff', async () => {
    const customer = await shopper();
    const { order } = await placeOrder(customer);
    expect((await confirm(customer, order.id)).errors).toBeUndefined();
    const response = await t.gql(ASK_AT_DOOR, { id: order.id }, { token: customer.accessToken });
    expect(errorCode(response)).toBe('FORBIDDEN');
  });
});

describe('cancelling a pay on delivery order', () => {
  it('works before it is prepared: stock back, nothing to refund because nothing was charged', async () => {
    const customer = await shopper();
    const { order, variantId } = await placeOrder(customer);
    const placed = await stockOf(variantId);
    const reservedBefore = placed?.quantityReserved ?? 0;
    const onHandBefore = placed?.quantityOnHand ?? 0;
    expect((await confirm(customer, order.id)).errors).toBeUndefined();

    const cancelled = await t.gql(CANCEL, { id: order.id }, { token: customer.accessToken });
    expect(cancelled.errors).toBeUndefined();
    expect(cancelled.data?.cancelOrder).toMatchObject({ status: 'CANCELLED' });

    expect(
      await t.db.select().from(schema.payments).where(eq(schema.payments.orderId, order.id)),
    ).toHaveLength(0);
    expect(await t.db.select().from(schema.refunds).where(eq(schema.refunds.orderId, order.id))).toHaveLength(
      0,
    );

    const after = await stockOf(variantId);
    expect(reservedBefore).toBeGreaterThan(0);
    expect(after?.quantityOnHand).toBe(onHandBefore);
    expect(after?.quantityReserved).toBe(reservedBefore - 1);
  });
});
