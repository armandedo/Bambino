import { randomUUID } from 'node:crypto';
import { schema } from '@bambino/database';
import { and, eq } from '@bambino/database/orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MOCK_WALLETS, type PaymentProvider } from '../providers/payments';
import { type TestApp, createTestApp, errorCode } from '../testing/test-app';

/**
 * Our deadline is not the provider's. These tests cover a customer approving after we stopped waiting: the money
 * is applied only to an order that still holds its stock, anything else becomes one staff review, and checking
 * again never repeats a stock deduction, delivery, notification or review.
 */
let t: TestApp;

beforeAll(async () => {
  t = await createTestApp({ catalogue: true });
}, 240_000);

afterAll(async () => {
  await t.close();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
let variantTurn = 0;

async function shopper() {
  const account = await t.registerCustomer();
  const address = await t.gql(
    'mutation ($input: AddressInput!) { createAddress(input: $input) { id } }',
    {
      input: {
        recipientName: 'Aline Uwase',
        phone: '+250788123456',
        countryCode: 'RW',
        region: 'Kigali',
        district: 'Gasabo',
        sector: 'Kimironko',
      },
    },
    { token: account.accessToken },
  );
  return { ...account, addressId: (address.data?.createAddress as { id: string }).id };
}

/** An order awaiting payment, with nothing paid or asked yet. */
async function unpaidOrder() {
  const customer = await shopper();
  const product = (await t.gql('query { product(slug: "seed-footed-romper") { variants { id } } }')).data
    ?.product as { variants: { id: string }[] };
  const variantId = product.variants[variantTurn++ % 4]?.id;
  if (!variantId) throw new Error('no variant');
  const token = { token: customer.accessToken };
  const added = await t.gql(
    'mutation ($id: ID!) { addToCart(variantId: $id, quantity: 1) { id } }',
    { id: variantId },
    token,
  );
  if (added.errors) throw new Error(JSON.stringify(added.errors));
  const created = await t.gql(
    'mutation ($input: CreateOrderInput!) { createOrder(input: $input) { id orderNumber } }',
    {
      input: {
        idempotencyKey: randomUUID(),
        checkout: { shippingAddressId: customer.addressId, deliveryOptionCode: 'SEED-STANDARD' },
      },
    },
    token,
  );
  if (created.errors) throw new Error(JSON.stringify(created.errors));
  const order = created.data?.createOrder as { id: string; orderNumber: string };
  return { customer, order, variantId };
}

const START = 'mutation ($input: InitiatePaymentInput!) { initiatePayment(input: $input) { id status } }';

/** Asks a wallet to pay the order and returns the payment's id. */
async function startPayment(customer: { accessToken: string }, orderId: string, msisdn: string) {
  const started = await t.gql(
    START,
    { input: { idempotencyKey: randomUUID(), orderId, provider: 'MOCK', msisdn } },
    { token: customer.accessToken },
  );
  if (started.errors) throw new Error(JSON.stringify(started.errors));
  return (started.data?.initiatePayment as { id: string }).id;
}

/** An order awaiting payment, with a payment request the customer has not answered yet. */
async function orderWithUnansweredPayment() {
  const { customer, order, variantId } = await unpaidOrder();
  const paymentId = await startPayment(customer, order.id, MOCK_WALLETS.neverAnswers);
  return { customer, order, variantId, paymentId, reference: (await payment(paymentId)).providerReference };
}

async function payment(id: string) {
  const [row] = await t.db.select().from(schema.payments).where(eq(schema.payments.id, id));
  if (!row) throw new Error('no payment');
  return row;
}

async function orderRow(id: string) {
  const [row] = await t.db.select().from(schema.orders).where(eq(schema.orders.id, id));
  if (!row) throw new Error('no order');
  return row;
}

async function stock(variantId: string) {
  const [row] = await t.db
    .select()
    .from(schema.inventoryItems)
    .where(eq(schema.inventoryItems.variantId, variantId));
  if (!row) throw new Error('no stock row');
  return { onHand: row.quantityOnHand, reserved: row.quantityReserved };
}

const reviewsOf = (paymentId: string) =>
  t.db.select().from(schema.paymentReviews).where(eq(schema.paymentReviews.paymentId, paymentId));
const deliveriesOf = (orderId: string) =>
  t.db.select().from(schema.deliveries).where(eq(schema.deliveries.orderId, orderId));
const notificationsOf = (userId: string, type: string) =>
  t.db
    .select()
    .from(schema.notifications)
    .where(and(eq(schema.notifications.userId, userId), eq(schema.notifications.type, type)));

/** From now on the provider answers for this one request as told; every other request is answered as usual. */
function providerSays(reference: string | null, answer: 'SUCCEEDED' | 'OUTAGE') {
  const original = t.mockPayments.getStatus.bind(t.mockPayments);
  return vi.spyOn(t.mockPayments, 'getStatus').mockImplementation(async (asked) => {
    if (asked !== reference) return original(asked);
    if (answer === 'OUTAGE') throw new Error('provider unavailable');
    return { status: 'SUCCEEDED' };
  });
}

/** Our own deadline passes: the payment expires locally while the provider has still said nothing final. */
async function letItExpire(paymentId: string) {
  t.advanceClock(11 * MINUTE);
  await t.app.runJobs();
  expect(await payment(paymentId)).toMatchObject({ status: 'EXPIRED', providerSettledAt: null });
}

describe('a payment approved after our deadline', () => {
  it('is applied once to an order that is still waiting, however often it is checked again', async () => {
    const { customer, order, variantId, paymentId, reference } = await orderWithUnansweredPayment();
    const before = await stock(variantId);
    await letItExpire(paymentId);
    expect((await orderRow(order.id)).status).toBe('PENDING_PAYMENT');

    providerSays(reference, 'SUCCEEDED');
    await t.app.runJobs();
    await t.app.runJobs();
    await t.app.runJobs();

    const paid = await payment(paymentId);
    expect(paid).toMatchObject({ status: 'SUCCEEDED', unapplied: false, failureCode: null });
    expect(paid.providerSettledAt).not.toBeNull();
    expect((await orderRow(order.id)).status).toBe('PAID');
    expect(await stock(variantId)).toEqual({ onHand: before.onHand - 1, reserved: before.reserved - 1 });
    expect(await deliveriesOf(order.id)).toHaveLength(1);
    const paidEvents = await t.db
      .select()
      .from(schema.orderStatusEvents)
      .where(
        and(eq(schema.orderStatusEvents.orderId, order.id), eq(schema.orderStatusEvents.newStatus, 'PAID')),
      );
    expect(paidEvents).toHaveLength(1);
    expect(await notificationsOf(customer.userId, 'ORDER_CONFIRMED')).toHaveLength(1);
    expect(await notificationsOf(customer.userId, 'PAYMENT_SUCCEEDED')).toHaveLength(1);
    expect(await reviewsOf(paymentId)).toHaveLength(0);
  });

  it('is recorded but not fulfilled when the order was cancelled, and opens one review that staff resolve', async () => {
    const finance = await t.registerStaff('FINANCE');
    const { customer, order, variantId, paymentId, reference } = await orderWithUnansweredPayment();
    await letItExpire(paymentId);
    const cancelled = await t.gql(
      'mutation ($id: ID!) { cancelOrder(id: $id) { status } }',
      { id: order.id },
      { token: customer.accessToken },
    );
    expect(cancelled.data?.cancelOrder).toMatchObject({ status: 'CANCELLED' });
    const released = await stock(variantId);

    providerSays(reference, 'SUCCEEDED');
    await t.app.runJobs();
    await t.app.runJobs();
    await t.app.runJobs();

    const received = await payment(paymentId);
    expect(received).toMatchObject({ status: 'SUCCEEDED', unapplied: true });
    expect(received.providerSettledAt).not.toBeNull();
    expect(await orderRow(order.id)).toMatchObject({ status: 'CANCELLED', paidAt: null });
    expect(await stock(variantId)).toEqual(released);
    expect(await deliveriesOf(order.id)).toHaveLength(0);
    expect(await notificationsOf(customer.userId, 'ORDER_CONFIRMED')).toHaveLength(0);

    const reviews = await reviewsOf(paymentId);
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({ reason: 'ORDER_CANCELLED', orderId: order.id, resolvedAt: null });
    const alerts = await notificationsOf(finance.userId, 'PAYMENT_REVIEW_REQUIRED');
    expect(
      alerts.filter((row) => (row.params as { paymentId?: string }).paymentId === paymentId),
    ).toHaveLength(1);
    expect(
      t.email.sent.filter((mail) => mail.to === finance.email && mail.template === 'staff.payment_review'),
    ).not.toHaveLength(0);

    const LIST = `query { adminPaymentReviews(open: true) { totalCount items { id reason open
      payment { providerReference unapplied payment { id status amount { amount currency } } }
      order { id orderNumber status } } } }`;
    expect(errorCode(await t.gql(LIST, {}, { token: customer.accessToken }))).toBe('FORBIDDEN');
    const listed = (await t.gql(LIST, {}, { token: finance.accessToken })).data?.adminPaymentReviews as {
      items: { id: string; payment: { payment: { id: string } } }[];
    };
    const shown = listed.items.find((item) => item.payment.payment.id === paymentId);
    expect(shown).toMatchObject({
      reason: 'ORDER_CANCELLED',
      open: true,
      payment: {
        providerReference: reference,
        unapplied: true,
        payment: { status: 'SUCCEEDED', amount: { amount: received.amount, currency: 'RWF' } },
      },
      order: { id: order.id, orderNumber: order.orderNumber, status: 'CANCELLED' },
    });

    const RESOLVE = `mutation ($input: ResolvePaymentReviewInput!) {
      adminResolvePaymentReview(input: $input) { open resolution resolutionNote resolvedAt } }`;
    const input = { id: shown?.id, resolution: 'REFUNDED', note: 'Refunded to the wallet' };
    expect(errorCode(await t.gql(RESOLVE, { input }, { token: customer.accessToken }))).toBe('FORBIDDEN');
    const resolved = await t.gql(RESOLVE, { input }, { token: finance.accessToken });
    expect(resolved.data?.adminResolvePaymentReview).toMatchObject({
      open: false,
      resolution: 'REFUNDED',
      resolutionNote: 'Refunded to the wallet',
    });
    expect(errorCode(await t.gql(RESOLVE, { input }, { token: finance.accessToken }))).toBe('CONFLICT');

    await t.app.runJobs();
    expect(await reviewsOf(paymentId)).toHaveLength(1);
  });

  it('does not fulfil an order whose stock has gone to someone else', async () => {
    const { customer, order, variantId, paymentId, reference } = await orderWithUnansweredPayment();
    await letItExpire(paymentId);
    await t.gql(
      'mutation ($id: ID!) { cancelOrder(id: $id) { status } }',
      { id: order.id },
      { token: customer.accessToken },
    );
    // Everything left on the shelf is now promised to other orders: nothing is available for this one.
    const shelf = await stock(variantId);
    await t.db
      .update(schema.inventoryItems)
      .set({ quantityReserved: shelf.onHand })
      .where(eq(schema.inventoryItems.variantId, variantId));
    const soldOut = await stock(variantId);

    providerSays(reference, 'SUCCEEDED');
    await t.app.runJobs();

    expect(await payment(paymentId)).toMatchObject({ status: 'SUCCEEDED', unapplied: true });
    expect((await orderRow(order.id)).status).toBe('CANCELLED');
    expect(await stock(variantId)).toEqual(soldOut);
    expect(await deliveriesOf(order.id)).toHaveLength(0);
    expect(await reviewsOf(paymentId)).toHaveLength(1);
    await t.db
      .update(schema.inventoryItems)
      .set({ quantityReserved: shelf.reserved })
      .where(eq(schema.inventoryItems.variantId, variantId));
  });

  it('opens a review, not a second fulfilment, when the order was meanwhile paid another way', async () => {
    const { customer, order, variantId, paymentId, reference } = await orderWithUnansweredPayment();
    await letItExpire(paymentId);
    const second = await t.gql(
      'mutation ($input: InitiatePaymentInput!) { initiatePayment(input: $input) { id } }',
      {
        input: {
          idempotencyKey: randomUUID(),
          orderId: order.id,
          provider: 'MOCK',
          msisdn: MOCK_WALLETS.approves,
        },
      },
      { token: customer.accessToken },
    );
    const secondId = (second.data?.initiatePayment as { id: string }).id;
    await t.gql(
      'query ($id: ID!) { payment(id: $id) { status } }',
      { id: secondId },
      { token: customer.accessToken },
    );
    expect((await orderRow(order.id)).status).toBe('PAID');
    const afterFirstSale = await stock(variantId);

    providerSays(reference, 'SUCCEEDED');
    await t.app.runJobs();
    await t.app.runJobs();

    expect(await payment(paymentId)).toMatchObject({ status: 'SUCCEEDED', unapplied: true });
    expect(await payment(secondId)).toMatchObject({ status: 'SUCCEEDED', unapplied: false });
    expect(await stock(variantId)).toEqual(afterFirstSale);
    expect(await deliveriesOf(order.id)).toHaveLength(1);
    const reviews = await reviewsOf(paymentId);
    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.reason).toBe('ORDER_NOT_AWAITING_PAYMENT');
  });
});

describe('a payment request that got no clear answer', () => {
  /** The provider call fails this way for the next payment that is started. */
  function requestFails(error: Error) {
    return vi.spyOn(t.mockPayments, 'initiate').mockRejectedValueOnce(error);
  }
  /** Gives the mock a reference that can be worked out from ours, as MTN MoMo's can. */
  function withDerivedReferences(prefix: string) {
    const provider = t.mockPayments as PaymentProvider;
    provider.referenceFor = (reference) => `${prefix}${reference}`;
    return () => {
      delete provider.referenceFor;
    };
  }

  it('closes a request that certainly never left, with nothing to review, and lets the customer retry', async () => {
    const { customer, order } = await unpaidOrder();
    requestFails(Object.assign(new Error('refused before sending'), { notSent: true }));
    const paymentId = await startPayment(customer, order.id, MOCK_WALLETS.approves);

    const closed = await payment(paymentId);
    expect(closed).toMatchObject({
      status: 'FAILED',
      failureCode: 'PROVIDER_ERROR',
      providerReference: null,
    });
    expect(closed.providerSettledAt).not.toBeNull();
    expect(await reviewsOf(paymentId)).toHaveLength(0);
    t.advanceClock(3 * MINUTE);
    await t.app.runJobs();
    expect(await reviewsOf(paymentId)).toHaveLength(0);

    const retry = await startPayment(customer, order.id, MOCK_WALLETS.approves);
    await t.gql(
      'query ($id: ID!) { payment(id: $id) { status } }',
      { id: retry },
      { token: customer.accessToken },
    );
    expect((await orderRow(order.id)).status).toBe('PAID');
  });

  it('sends a timed-out request that nothing can look up again straight to staff review', async () => {
    const { customer, order } = await unpaidOrder();
    requestFails(new Error('socket hang up'));
    const paymentId = await startPayment(customer, order.id, MOCK_WALLETS.approves);

    expect(await payment(paymentId)).toMatchObject({ status: 'FAILED', failureCode: 'PROVIDER_ERROR' });
    const reviews = await reviewsOf(paymentId);
    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.reason).toBe('OUTCOME_UNCONFIRMED');
    expect((await orderRow(order.id)).status).toBe('PENDING_PAYMENT');
    t.advanceClock(3 * MINUTE);
    await t.app.runJobs();
    expect(await reviewsOf(paymentId)).toHaveLength(1);
  });

  it('keeps checking a timed-out request it can look up, and applies the approval when it comes', async () => {
    const { customer, order } = await unpaidOrder();
    const restore = withDerivedReferences('mock-waiting-');
    try {
      requestFails(new Error('timeout: the response was lost'));
      const paymentId = await startPayment(customer, order.id, MOCK_WALLETS.approves);
      const lost = await payment(paymentId);
      expect(lost).toMatchObject({
        status: 'FAILED',
        providerReference: `mock-waiting-${lost.idempotencyKey}`,
        providerSettledAt: null,
      });
      expect(await reviewsOf(paymentId)).toHaveLength(0);

      t.advanceClock(3 * MINUTE);
      await t.app.runJobs();
      expect(await payment(paymentId)).toMatchObject({ status: 'FAILED', providerSettledAt: null });

      providerSays(lost.providerReference, 'SUCCEEDED');
      await t.app.runJobs();
      await t.app.runJobs();
      expect(await payment(paymentId)).toMatchObject({ status: 'SUCCEEDED', unapplied: false });
      expect((await orderRow(order.id)).status).toBe('PAID');
      expect(await deliveriesOf(order.id)).toHaveLength(1);
      expect(await reviewsOf(paymentId)).toHaveLength(0);
    } finally {
      restore();
    }
  });

  it('sends it to staff when the provider still has no record of the request a day later', async () => {
    const { customer, order } = await unpaidOrder();
    const restore = withDerivedReferences('mock-lost-');
    try {
      requestFails(new Error('connection reset'));
      const paymentId = await startPayment(customer, order.id, MOCK_WALLETS.approves);
      expect(await payment(paymentId)).toMatchObject({ status: 'FAILED', providerSettledAt: null });

      t.advanceClock(12 * HOUR);
      await t.app.runJobs();
      expect(await reviewsOf(paymentId)).toHaveLength(0);

      t.advanceClock(13 * HOUR);
      await t.app.runJobs();
      await t.app.runJobs();
      expect((await payment(paymentId)).providerSettledAt).not.toBeNull();
      const reviews = await reviewsOf(paymentId);
      expect(reviews).toHaveLength(1);
      expect(reviews[0]?.reason).toBe('OUTCOME_UNCONFIRMED');
    } finally {
      restore();
    }
  });
});

describe('a provider that cannot answer', () => {
  it('leaves the payment open to later checks during an outage, and applies the answer when it comes', async () => {
    const { order, paymentId, reference } = await orderWithUnansweredPayment();
    await letItExpire(paymentId);

    const outage = providerSays(reference, 'OUTAGE');
    await expect(t.app.runJobs()).resolves.toBeDefined();
    await expect(t.app.runJobs()).resolves.toBeDefined();
    expect(outage).toHaveBeenCalled();
    expect(await payment(paymentId)).toMatchObject({ status: 'EXPIRED', providerSettledAt: null });
    expect(await reviewsOf(paymentId)).toHaveLength(0);
    expect((await orderRow(order.id)).status).toBe('PENDING_PAYMENT');
    outage.mockRestore();

    providerSays(reference, 'SUCCEEDED');
    await t.app.runJobs();
    expect((await payment(paymentId)).status).toBe('SUCCEEDED');
    expect((await orderRow(order.id)).status).toBe('PAID');
  });

  it('hands a payment to staff when the provider never gives a final answer, exactly once', async () => {
    const { paymentId } = await orderWithUnansweredPayment();
    await letItExpire(paymentId);

    t.advanceClock(12 * HOUR);
    await t.app.runJobs();
    expect(await payment(paymentId)).toMatchObject({ status: 'EXPIRED', providerSettledAt: null });
    expect(await reviewsOf(paymentId)).toHaveLength(0);

    t.advanceClock(13 * HOUR);
    await t.app.runJobs();
    await t.app.runJobs();
    const settled = await payment(paymentId);
    expect(settled.status).toBe('EXPIRED');
    expect(settled.providerSettledAt).not.toBeNull();
    const reviews = await reviewsOf(paymentId);
    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.reason).toBe('OUTCOME_UNCONFIRMED');

    // The automatic watch is over, but staff can still ask the provider, which now says it was approved.
    await t.app.runJobs();
    providerSays(settled.providerReference, 'SUCCEEDED');
    await t.app.runJobs();
    expect((await payment(paymentId)).status).toBe('EXPIRED');
    const finance = await t.registerStaff('FINANCE');
    const asked = await t.gql(
      'mutation ($id: ID!) { adminReconcilePayment(id: $id) { status } }',
      { id: paymentId },
      { token: finance.accessToken },
    );
    expect(asked.data?.adminReconcilePayment).toMatchObject({ status: 'SUCCEEDED' });
    // The order was cancelled long ago, so the money is recorded, not applied, and the one review stays.
    expect(await payment(paymentId)).toMatchObject({ status: 'SUCCEEDED', unapplied: true });
    expect(await reviewsOf(paymentId)).toHaveLength(1);
  });
});
