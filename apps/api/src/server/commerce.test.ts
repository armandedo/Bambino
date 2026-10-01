import { randomUUID } from 'node:crypto';
import { schema } from '@bambino/database';
import { and, eq } from '@bambino/database/orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MOCK_SIGNATURE_HEADER, MOCK_WALLETS } from '../providers/payments';
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

const PRODUCT = `query ($slug: String!) { product(slug: $slug) { id name priceFrom { amount currency }
  variants { id sku color inStock price { amount } size { code } } category { slug } } }`;
const ADD =
  'mutation ($id: ID!, $q: Int) { addToCart(variantId: $id, quantity: $q) { id itemCount subtotal { amount } items { id quantity lineTotal { amount } } } }';
const CART =
  '{ myCart { id itemCount subtotal { amount } items { id quantity variant { sku } product { name } } } }';
const PREVIEW = `query ($input: CheckoutInput!) { checkoutPreview(input: $input) { promotionError availableCredit { amount }
  totals { subtotal { amount } discount { amount } shipping { amount } tax { amount } creditApplied { amount } total { amount } } } }`;
const CREATE_ORDER = `mutation ($input: CreateOrderInput!) { createOrder(input: $input) { id orderNumber status
  totals { subtotal { amount } discount { amount } shipping { amount } creditApplied { amount } total { amount } }
  items { sku quantity unitPrice { amount } lineTotal { amount } } } }`;
const PAY =
  'mutation ($input: InitiatePaymentInput!) { initiatePayment(input: $input) { id status provider amount { amount } failureMessage } }';
const PAYMENT = 'query ($id: ID!) { payment(id: $id) { id status failureMessage completedAt } }';
const ORDER = `query ($id: ID!) { order(id: $id) { id status paidAt statusHistory { status }
  delivery { status trackingNumber provider events { status } } payments { status } } }`;

/** A signed-in customer with an address. */
async function shopper() {
  const account = await t.registerCustomer();
  const address = await t.gql(
    'mutation ($input: AddressInput!) { createAddress(input: $input) { id } }',
    { input: kigali },
    { token: account.accessToken },
  );
  return { ...account, addressId: (address.data?.createAddress as { id: string }).id };
}

async function variantOf(slug: string, index = 0) {
  const product = (await t.gql(PRODUCT, { slug })).data?.product as {
    variants: { id: string; sku: string; price: { amount: number } }[];
  };
  const variant = product.variants[index];
  if (!variant) throw new Error(`no variant ${index} for ${slug}`);
  return variant;
}

async function availability(variantId: string) {
  const [item] = await t.db
    .select()
    .from(schema.inventoryItems)
    .where(eq(schema.inventoryItems.variantId, variantId));
  return item;
}

let orderSequence = 0;

/** Puts one variant in the cart and checks out, returning the created order. */
async function placeOrder(
  customer: Awaited<ReturnType<typeof shopper>>,
  options: {
    slug?: string;
    quantity?: number;
    promotionCode?: string;
    applyExchangeCredit?: boolean;
    variantIndex?: number;
  } = {},
) {
  // Rotate through the four sizes so repeated orders do not exhaust one variant's seed stock.
  const variant = await variantOf(
    options.slug ?? 'seed-footed-romper',
    options.variantIndex ?? orderSequence++ % 4,
  );
  const added = await t.gql(
    ADD,
    { id: variant.id, q: options.quantity ?? 1 },
    { token: customer.accessToken },
  );
  if (added.errors) throw new Error(JSON.stringify(added.errors));
  const response = await t.gql(
    CREATE_ORDER,
    {
      input: {
        idempotencyKey: randomUUID(),
        checkout: {
          shippingAddressId: customer.addressId,
          deliveryOptionCode: 'SEED-STANDARD',
          promotionCode: options.promotionCode ?? null,
          applyExchangeCredit: options.applyExchangeCredit ?? false,
        },
      },
    },
    { token: customer.accessToken },
  );
  if (response.errors) throw new Error(JSON.stringify(response.errors));
  return {
    order: response.data?.createOrder as {
      id: string;
      orderNumber: string;
      status: string;
      totals: { total: { amount: number } };
    },
    variant,
  };
}

async function pay(
  customer: { accessToken: string },
  orderId: string,
  msisdn: string = MOCK_WALLETS.approves,
) {
  const response = await t.gql(
    PAY,
    { input: { idempotencyKey: randomUUID(), orderId, provider: 'MOCK', msisdn } },
    { token: customer.accessToken },
  );
  if (response.errors) throw new Error(JSON.stringify(response.errors));
  return response.data?.initiatePayment as { id: string; status: string };
}

describe('catalogue', () => {
  it('lists active products with search, category, size, sort and pagination', async () => {
    const list = `query ($filter: ProductFilter, $sort: ProductSort, $first: Int, $after: String) {
      products(filter: $filter, sort: $sort, first: $first, after: $after) { totalCount edges { cursor node { slug priceFrom { amount } } } pageInfo { endCursor hasNextPage } } }`;
    type Listing = {
      totalCount: number;
      edges: { node: { slug: string; priceFrom: { amount: number } } }[];
      pageInfo: { endCursor: string; hasNextPage: boolean };
    };
    const slugs = async (variables: Record<string, unknown>) =>
      ((await t.gql(list, variables)).data?.products as Listing).edges.map((edge) => edge.node.slug);

    expect(await slugs({ filter: { search: 'romper' } })).toEqual(['seed-footed-romper']);
    expect(await slugs({ filter: { categorySlug: 'sleepwear' } })).toEqual(['seed-sleep-suit']);
    expect(await slugs({ filter: { sizeCodes: ['NB'] } })).toEqual([]);
    expect(await slugs({ filter: { maxPrice: 8_000 } })).toEqual(['seed-everyday-trousers']);
    expect(await slugs({ sort: 'PRICE_ASC' })).toEqual([
      'seed-everyday-trousers',
      'seed-organic-cotton-bodysuit',
      'seed-sleep-suit',
      'seed-footed-romper',
    ]);

    const first = (await t.gql(list, { sort: 'NAME_ASC', first: 3 })).data?.products as Listing;
    expect(first.totalCount).toBe(4);
    expect(first.pageInfo.hasNextPage).toBe(true);
    const second = (await t.gql(list, { sort: 'NAME_ASC', first: 3, after: first.pageInfo.endCursor })).data
      ?.products as Listing;
    expect(second.edges).toHaveLength(1);
    expect(second.pageInfo.hasNextPage).toBe(false);
  });

  it('serves product detail with variants, sizes, stock and the lowest price', async () => {
    const product = (await t.gql(PRODUCT, { slug: 'seed-organic-cotton-bodysuit' })).data?.product as {
      priceFrom: { amount: number; currency: string };
      variants: { inStock: boolean; size: { code: string } }[];
      category: { slug: string };
    };
    expect(product.priceFrom).toEqual({ amount: 8_500, currency: 'RWF' });
    expect(product.variants).toHaveLength(8);
    expect(product.variants.every((variant) => variant.inStock)).toBe(true);
    expect(product.category.slug).toBe('bodysuits');
    expect((await t.gql(PRODUCT, { slug: 'no-such-product' })).data?.product).toBeNull();
  });

  it('serves categories, sizes and delivery options', async () => {
    const response = await t.gql(
      '{ categories { slug } sizes { code } deliveryOptions { code fee { amount } } }',
    );
    expect((response.data?.categories as unknown[]).length).toBe(9);
    expect((response.data?.sizes as { code: string }[])[0]?.code).toBe('NB');
    expect(response.data?.deliveryOptions).toEqual([
      { code: 'SEED-STANDARD', fee: { amount: 2_000 } },
      { code: 'SEED-EXPRESS', fee: { amount: 4_000 } },
    ]);
  });
});

describe('cart', () => {
  it('adds, merges, updates and removes lines with prices read fresh from the catalogue', async () => {
    const customer = await shopper();
    const variant = await variantOf('seed-sleep-suit');
    await t.gql(ADD, { id: variant.id, q: 1 }, { token: customer.accessToken });
    const merged = (await t.gql(ADD, { id: variant.id, q: 2 }, { token: customer.accessToken })).data
      ?.addToCart as {
      itemCount: number;
      subtotal: { amount: number };
      items: { id: string }[];
    };
    expect(merged).toMatchObject({ itemCount: 3, subtotal: { amount: 31_500 } });
    const itemId = merged.items[0]?.id;

    const updated = await t.gql(
      'mutation ($id: ID!) { updateCartItem(itemId: $id, quantity: 1) { itemCount } }',
      { id: itemId },
      { token: customer.accessToken },
    );
    expect(updated.data?.updateCartItem).toEqual({ itemCount: 1 });
    const removed = await t.gql(
      'mutation ($id: ID!) { removeFromCart(itemId: $id) { itemCount } }',
      { id: itemId },
      { token: customer.accessToken },
    );
    expect(removed.data?.removeFromCart).toEqual({ itemCount: 0 });
  });

  it("refuses more than is in stock and hides other customers' cart items", async () => {
    const owner = await shopper();
    const other = await shopper();
    const variant = await variantOf('seed-everyday-trousers', 3);
    expect(errorReason(await t.gql(ADD, { id: variant.id, q: 11 }, { token: owner.accessToken }))).toBe(
      'OUT_OF_STOCK',
    );
    const cart = (await t.gql(ADD, { id: variant.id, q: 1 }, { token: owner.accessToken })).data
      ?.addToCart as { items: { id: string }[] };
    const response = await t.gql(
      'mutation ($id: ID!) { removeFromCart(itemId: $id) { itemCount } }',
      { id: cart.items[0]?.id },
      { token: other.accessToken },
    );
    expect(errorCode(response)).toBe('NOT_FOUND');
  });
});

describe('checkout', () => {
  it('previews server-side totals, applies a valid promotion and explains an invalid one', async () => {
    const customer = await shopper();
    const variant = await variantOf('seed-footed-romper', 1);
    await t.gql(ADD, { id: variant.id, q: 2 }, { token: customer.accessToken });
    const input = { shippingAddressId: customer.addressId, deliveryOptionCode: 'SEED-STANDARD' };

    const plain = (await t.gql(PREVIEW, { input }, { token: customer.accessToken })).data
      ?.checkoutPreview as Record<string, unknown>;
    expect(plain).toMatchObject({
      promotionError: null,
      totals: {
        subtotal: { amount: 24_000 },
        discount: { amount: 0 },
        shipping: { amount: 2_000 },
        tax: { amount: 0 },
        total: { amount: 26_000 },
      },
    });
    const promo = (
      await t.gql(PREVIEW, { input: { ...input, promotionCode: 'seed10' } }, { token: customer.accessToken })
    ).data?.checkoutPreview;
    expect(promo).toMatchObject({
      promotionError: null,
      totals: { discount: { amount: 2_400 }, total: { amount: 23_600 } },
    });
    const bad = (
      await t.gql(PREVIEW, { input: { ...input, promotionCode: 'NOPE' } }, { token: customer.accessToken })
    ).data?.checkoutPreview;
    expect(bad).toMatchObject({
      promotionError: 'This promotion code does not exist.',
      totals: { discount: { amount: 0 } },
    });
  });

  it('creates an order that reserves stock, empties the cart, and is safe to resubmit', async () => {
    const customer = await shopper();
    const variant = await variantOf('seed-footed-romper', 2);
    const before = await availability(variant.id);
    await t.gql(ADD, { id: variant.id, q: 2 }, { token: customer.accessToken });
    const input = {
      idempotencyKey: randomUUID(),
      checkout: {
        shippingAddressId: customer.addressId,
        deliveryOptionCode: 'SEED-STANDARD',
        promotionCode: 'SEED10',
      },
    };
    const first = await t.gql(CREATE_ORDER, { input }, { token: customer.accessToken });
    const order = first.data?.createOrder as {
      id: string;
      orderNumber: string;
      status: string;
      items: unknown[];
    };
    expect(order).toMatchObject({
      status: 'PENDING_PAYMENT',
      totals: {
        subtotal: { amount: 24_000 },
        discount: { amount: 2_400 },
        shipping: { amount: 2_000 },
        total: { amount: 23_600 },
      },
      items: [
        { sku: variant.sku, quantity: 2, unitPrice: { amount: 12_000 }, lineTotal: { amount: 24_000 } },
      ],
    });
    expect(order.orderNumber).toMatch(/^BMB-[A-Z2-9]{8}$/);
    expect((await availability(variant.id))?.quantityReserved).toBe((before?.quantityReserved ?? 0) + 2);
    expect((await t.gql(CART, {}, { token: customer.accessToken })).data?.myCart).toBeNull();

    const resubmitted = await t.gql(CREATE_ORDER, { input }, { token: customer.accessToken });
    expect((resubmitted.data?.createOrder as { id: string }).id).toBe(order.id);
    expect((await availability(variant.id))?.quantityReserved).toBe((before?.quantityReserved ?? 0) + 2);
  });

  it('lets each customer use a promotion once', async () => {
    const customer = await shopper();
    await placeOrder(customer, { promotionCode: 'SEED10' });
    const variant = await variantOf('seed-footed-romper');
    await t.gql(ADD, { id: variant.id, q: 1 }, { token: customer.accessToken });
    const again = await t.gql(
      CREATE_ORDER,
      {
        input: {
          idempotencyKey: randomUUID(),
          checkout: {
            shippingAddressId: customer.addressId,
            deliveryOptionCode: 'SEED-STANDARD',
            promotionCode: 'SEED10',
          },
        },
      },
      { token: customer.accessToken },
    );
    expect(errorReason(again)).toBe('PROMOTION_ALREADY_USED');
  });

  it('never sells the last unit twice', async () => {
    const admin = await t.registerStaff('SUPER_ADMIN');
    const variant = await variantOf('seed-sleep-suit', 3);
    const stock = await availability(variant.id);
    await t.gql(
      'mutation ($input: InventoryAdjustmentInput!) { adminAdjustInventory(input: $input) { quantityAvailable } }',
      {
        input: {
          variantId: variant.id,
          locationCode: 'KGL-MAIN',
          onHandDelta: 1 - (stock?.quantityOnHand ?? 0),
          note: 'test: leave one unit',
        },
      },
      { token: admin.accessToken },
    );
    const a = await shopper();
    const b = await shopper();
    for (const customer of [a, b])
      await t.gql(ADD, { id: variant.id, q: 1 }, { token: customer.accessToken });
    const attempt = (customer: typeof a) =>
      t.gql(
        CREATE_ORDER,
        {
          input: {
            idempotencyKey: randomUUID(),
            checkout: { shippingAddressId: customer.addressId, deliveryOptionCode: 'SEED-STANDARD' },
          },
        },
        { token: customer.accessToken },
      );
    const results = await Promise.all([attempt(a), attempt(b)]);
    expect(results.filter((result) => !result.errors)).toHaveLength(1);
    expect(results.map(errorReason).filter(Boolean)).toEqual(['OUT_OF_STOCK']);
  });
});

describe('payments', () => {
  it('confirms payment from the provider, marks the order paid, commits stock and creates a delivery', async () => {
    const customer = await shopper();
    const { order, variant } = await placeOrder(customer, { quantity: 2 });
    const before = await availability(variant.id);

    const payment = await pay(customer, order.id);
    expect(payment.status).toBe('PENDING');
    expect((await t.gql(ORDER, { id: order.id }, { token: customer.accessToken })).data?.order).toMatchObject(
      { status: 'PENDING_PAYMENT' },
    );

    const polled = (await t.gql(PAYMENT, { id: payment.id }, { token: customer.accessToken })).data?.payment;
    expect(polled).toMatchObject({ status: 'SUCCEEDED', failureMessage: null });
    const paid = (await t.gql(ORDER, { id: order.id }, { token: customer.accessToken })).data
      ?.order as Record<string, unknown>;
    expect(paid).toMatchObject({
      status: 'PAID',
      statusHistory: [{ status: 'PENDING_PAYMENT' }, { status: 'PAID' }],
      delivery: { status: 'PENDING', provider: 'IN_HOUSE', events: [{ status: 'PENDING' }] },
      payments: [{ status: 'SUCCEEDED' }],
    });
    const after = await availability(variant.id);
    expect(after?.quantityOnHand).toBe((before?.quantityOnHand ?? 0) - 2);
    expect(after?.quantityReserved).toBe((before?.quantityReserved ?? 0) - 2);

    const notifications = (
      await t.gql(
        '{ myNotifications { unreadCount edges { node { type } } } }',
        {},
        { token: customer.accessToken },
      )
    ).data?.myNotifications as { unreadCount: number; edges: { node: { type: string } }[] };
    expect(notifications.edges.map((edge) => edge.node.type)).toEqual(
      expect.arrayContaining(['PAYMENT_SUCCEEDED', 'ORDER_CONFIRMED']),
    );
  });

  it('reports a declined payment safely and lets the customer try again', async () => {
    const customer = await shopper();
    const { order } = await placeOrder(customer);
    const declined = await pay(customer, order.id, MOCK_WALLETS.declines);
    const polled = (await t.gql(PAYMENT, { id: declined.id }, { token: customer.accessToken })).data?.payment;
    expect(polled).toMatchObject({ status: 'FAILED', failureMessage: expect.stringContaining('declined') });
    expect((await t.gql(ORDER, { id: order.id }, { token: customer.accessToken })).data?.order).toMatchObject(
      { status: 'PENDING_PAYMENT' },
    );

    const retry = await pay(customer, order.id);
    await t.gql(PAYMENT, { id: retry.id }, { token: customer.accessToken });
    expect((await t.gql(ORDER, { id: order.id }, { token: customer.accessToken })).data?.order).toMatchObject(
      { status: 'PAID' },
    );
  });

  it('returns the same payment for a repeated request and refuses a second one while the first is open', async () => {
    const customer = await shopper();
    const { order } = await placeOrder(customer);
    const input = {
      idempotencyKey: randomUUID(),
      orderId: order.id,
      provider: 'MOCK',
      msisdn: MOCK_WALLETS.neverAnswers,
    };
    const first = (await t.gql(PAY, { input }, { token: customer.accessToken })).data?.initiatePayment as {
      id: string;
    };
    const repeat = (await t.gql(PAY, { input }, { token: customer.accessToken })).data?.initiatePayment as {
      id: string;
    };
    expect(repeat.id).toBe(first.id);
    const second = await t.gql(
      PAY,
      { input: { ...input, idempotencyKey: randomUUID() } },
      { token: customer.accessToken },
    );
    expect(errorReason(second)).toBe('PAYMENT_IN_PROGRESS');
    expect(
      errorReason(
        await t.gql(
          'mutation ($id: ID!) { cancelOrder(id: $id) { status } }',
          { id: order.id },
          { token: customer.accessToken },
        ),
      ),
    ).toBe('PAYMENT_IN_PROGRESS');
  });

  it('applies a signed webhook once, ignores replays and rejects a bad signature', async () => {
    const customer = await shopper();
    const { order } = await placeOrder(customer);
    const payment = await pay(customer, order.id);
    const [row] = await t.db.select().from(schema.payments).where(eq(schema.payments.id, payment.id));
    const body = JSON.stringify({ eventId: `evt-${payment.id}`, reference: row?.providerReference });
    const send = (signature: string, payload = body) =>
      t.app.handleWebhook(
        new Request('http://api.test/webhooks/payments/mock', {
          method: 'POST',
          headers: { 'content-type': 'application/json', [MOCK_SIGNATURE_HEADER]: signature },
          body: payload,
        }),
      );

    expect((await send(t.mockPayments.sign(body))).status).toBe(200);
    expect((await send(t.mockPayments.sign(body))).status).toBe(200);
    const events = await t.db
      .select()
      .from(schema.webhookEvents)
      .where(eq(schema.webhookEvents.providerEventId, `evt-${payment.id}`));
    expect(events).toHaveLength(1);
    const paidEvents = await t.db
      .select()
      .from(schema.orderStatusEvents)
      .where(
        and(eq(schema.orderStatusEvents.orderId, order.id), eq(schema.orderStatusEvents.newStatus, 'PAID')),
      );
    expect(paidEvents).toHaveLength(1);

    const forged = JSON.stringify({ eventId: 'evt-forged', reference: row?.providerReference });
    expect((await send('0'.repeat(64), forged)).status).toBe(401);
    expect((await send('x', 'not json')).status).toBe(400);
  });

  it('expires unanswered payments and later cancels the unpaid order, returning its stock', async () => {
    const customer = await shopper();
    const { order, variant } = await placeOrder(customer);
    const reserved = (await availability(variant.id))?.quantityReserved ?? 0;
    const payment = await pay(customer, order.id, MOCK_WALLETS.neverAnswers);

    t.advanceClock(11 * 60_000);
    await t.app.runJobs();
    expect(
      (await t.gql(PAYMENT, { id: payment.id }, { token: customer.accessToken })).data?.payment,
    ).toMatchObject({ status: 'EXPIRED' });

    t.advanceClock(25 * 3_600_000);
    const result = await t.app.runJobs();
    expect(result.cancelledOrders).toBeGreaterThanOrEqual(1);
    // The customer's access token has long expired at this clock time, so read the row directly.
    const [cancelled] = await t.db.select().from(schema.orders).where(eq(schema.orders.id, order.id));
    expect(cancelled?.status).toBe('CANCELLED');
    expect((await availability(variant.id))?.quantityReserved).toBe(reserved - 1);
  });

  it('says plainly that MTN MoMo is not integrated yet', async () => {
    const customer = await shopper();
    const { order } = await placeOrder(customer);
    const response = await t.gql(
      PAY,
      {
        input: {
          idempotencyKey: randomUUID(),
          orderId: order.id,
          provider: 'MTN_MOMO',
          msisdn: '+250788123456',
        },
      },
      { token: customer.accessToken },
    );
    expect(errorCode(response)).toBe('NOT_IMPLEMENTED');
    expect(errorReason(response)).toBe('PROVIDER_NOT_INTEGRATED');
  });

  it("does not let a customer pay for or see someone else's order", async () => {
    const owner = await shopper();
    const intruder = await shopper();
    const { order } = await placeOrder(owner);
    expect((await t.gql(ORDER, { id: order.id }, { token: intruder.accessToken })).data?.order).toBeNull();
    const response = await t.gql(
      PAY,
      {
        input: {
          idempotencyKey: randomUUID(),
          orderId: order.id,
          provider: 'MOCK',
          msisdn: MOCK_WALLETS.approves,
        },
      },
      { token: intruder.accessToken },
    );
    expect(errorCode(response)).toBe('NOT_FOUND');
  });
});

describe('cancellation and exchange credit', () => {
  it('cancels an unpaid order and returns its stock', async () => {
    const customer = await shopper();
    const { order, variant } = await placeOrder(customer);
    const reserved = (await availability(variant.id))?.quantityReserved ?? 0;
    const response = await t.gql(
      'mutation ($id: ID!) { cancelOrder(id: $id) { status } }',
      { id: order.id },
      { token: customer.accessToken },
    );
    expect(response.data?.cancelOrder).toEqual({ status: 'CANCELLED' });
    expect((await availability(variant.id))?.quantityReserved).toBe(reserved - 1);
  });

  it('pays an order entirely from credit, and returns credit when an order is cancelled', async () => {
    const customer = await shopper();
    // Credit is earned through returns in Phase 5; inserted directly here.
    await t.db.insert(schema.exchangeCredits).values({
      userId: customer.userId,
      entryType: 'ADJUSTMENT',
      amount: 20_000,
      currency: 'RWF',
      note: 'test credit',
    });

    const covered = await placeOrder(customer, { slug: 'seed-everyday-trousers', applyExchangeCredit: true });
    expect(covered.order).toMatchObject({
      status: 'PAID',
      totals: { creditApplied: { amount: 9_000 }, total: { amount: 0 } },
    });
    const credits = await t.gql(
      '{ myExchangeCredits { balance { amount } entries { type amount { amount } } } }',
      {},
      { token: customer.accessToken },
    );
    expect(credits.data?.myExchangeCredits).toMatchObject({
      balance: { amount: 11_000 },
      entries: [
        { type: 'REDEEMED', amount: { amount: -9_000 } },
        { type: 'ADJUSTMENT', amount: { amount: 20_000 } },
      ],
    });

    const partial = await placeOrder(customer, { slug: 'seed-footed-romper' });
    const applied = await t.gql(
      'mutation ($id: ID!) { applyExchangeCredit(orderId: $id) { totalAmount: totals { creditApplied { amount } total { amount } } } }',
      { id: partial.order.id },
      { token: customer.accessToken },
    );
    expect(applied.data?.applyExchangeCredit).toEqual({
      totalAmount: { creditApplied: { amount: 11_000 }, total: { amount: 3_000 } },
    });
    expect(
      errorReason(
        await t.gql(
          'mutation ($id: ID!) { applyExchangeCredit(orderId: $id) { id } }',
          { id: partial.order.id },
          { token: customer.accessToken },
        ),
      ),
    ).toBe('CREDIT_ALREADY_APPLIED');

    await t.gql(
      'mutation ($id: ID!) { cancelOrder(id: $id) { status } }',
      { id: partial.order.id },
      { token: customer.accessToken },
    );
    const ledger = await t.db
      .select()
      .from(schema.exchangeCredits)
      .where(eq(schema.exchangeCredits.userId, customer.userId));
    expect(ledger.reduce((total, entry) => total + entry.amount, 0)).toBe(11_000);
  });
});

describe('staff fulfilment', () => {
  const STATUS =
    'mutation ($id: ID!, $status: OrderStatus!) { adminUpdateOrderStatus(orderId: $id, status: $status) { status } }';
  const DELIVERY =
    'mutation ($input: DeliveryUpdateInput!) { adminUpdateDelivery(input: $input) { status deliveredAt } }';

  it('moves a paid order through warehouse steps and delivery to DELIVERED', async () => {
    const ops = await t.registerStaff('OPERATIONS_MANAGER');
    const rider = await t.registerStaff('DELIVERY_STAFF');
    const customer = await shopper();
    const { order } = await placeOrder(customer);
    const payment = await pay(customer, order.id);
    await t.gql(PAYMENT, { id: payment.id }, { token: customer.accessToken });

    expect(
      errorReason(await t.gql(STATUS, { id: order.id, status: 'PAID' }, { token: ops.accessToken })),
    ).toBe('STATUS_NOT_SETTABLE');
    expect(
      errorCode(await t.gql(STATUS, { id: order.id, status: 'PROCESSING' }, { token: rider.accessToken })),
    ).toBe('FORBIDDEN');
    for (const status of ['PROCESSING', 'PACKED', 'READY_FOR_DISPATCH']) {
      expect(
        (await t.gql(STATUS, { id: order.id, status }, { token: ops.accessToken })).data
          ?.adminUpdateOrderStatus,
      ).toEqual({ status });
    }
    expect(
      errorReason(await t.gql(STATUS, { id: order.id, status: 'CANCELLED' }, { token: ops.accessToken })),
    ).toBe('REFUND_NOT_SUPPORTED');

    const [delivery] = await t.db
      .select()
      .from(schema.deliveries)
      .where(eq(schema.deliveries.orderId, order.id));
    for (const status of ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT']) {
      const response = await t.gql(
        DELIVERY,
        { input: { deliveryId: delivery?.id, status } },
        { token: rider.accessToken },
      );
      expect(response.errors).toBeUndefined();
    }
    expect((await t.gql(ORDER, { id: order.id }, { token: customer.accessToken })).data?.order).toMatchObject(
      { status: 'OUT_FOR_DELIVERY' },
    );
    const delivered = await t.gql(
      DELIVERY,
      { input: { deliveryId: delivery?.id, status: 'DELIVERED' } },
      { token: rider.accessToken },
    );
    expect(delivered.data?.adminUpdateDelivery).toMatchObject({
      status: 'DELIVERED',
      deliveredAt: expect.any(String),
    });

    const final = (await t.gql(ORDER, { id: order.id }, { token: customer.accessToken })).data?.order as {
      status: string;
      statusHistory: { status: string }[];
      delivery: { events: { status: string }[] };
    };
    expect(final.status).toBe('DELIVERED');
    expect(final.statusHistory.map((event) => event.status)).toEqual([
      'PENDING_PAYMENT',
      'PAID',
      'PROCESSING',
      'PACKED',
      'READY_FOR_DISPATCH',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
    ]);
    expect(final.delivery.events.map((event) => event.status)).toEqual([
      'PENDING',
      'ASSIGNED',
      'PICKED_UP',
      'IN_TRANSIT',
      'DELIVERED',
    ]);
  });

  it('refuses to put a delivery in transit before the order is ready for dispatch', async () => {
    const rider = await t.registerStaff('DELIVERY_STAFF');
    const customer = await shopper();
    const { order } = await placeOrder(customer);
    const payment = await pay(customer, order.id);
    await t.gql(PAYMENT, { id: payment.id }, { token: customer.accessToken });
    const [delivery] = await t.db
      .select()
      .from(schema.deliveries)
      .where(eq(schema.deliveries.orderId, order.id));
    for (const status of ['ASSIGNED', 'PICKED_UP'])
      await t.gql(DELIVERY, { input: { deliveryId: delivery?.id, status } }, { token: rider.accessToken });
    expect(
      errorReason(
        await t.gql(
          DELIVERY,
          { input: { deliveryId: delivery?.id, status: 'IN_TRANSIT' } },
          { token: rider.accessToken },
        ),
      ),
    ).toBe('ORDER_NOT_READY');
  });

  it('audits price changes and shows new prices in carts immediately', async () => {
    const admin = await t.registerStaff('SUPER_ADMIN');
    const customer = await shopper();
    const variant = await variantOf('seed-organic-cotton-bodysuit', 7);
    await t.gql(ADD, { id: variant.id, q: 1 }, { token: customer.accessToken });
    const [row] = await t.db
      .select()
      .from(schema.productVariants)
      .where(eq(schema.productVariants.id, variant.id));
    const change = await t.gql(
      'mutation ($input: VariantInput!) { adminUpsertVariant(input: $input) { price { amount } } }',
      {
        input: {
          id: variant.id,
          productId: row?.productId,
          sku: row?.sku,
          sizeCode: row?.sizeCode,
          color: row?.color,
          priceAmount: 9_900,
        },
      },
      { token: admin.accessToken },
    );
    expect(change.data?.adminUpsertVariant).toEqual({ price: { amount: 9_900 } });
    expect(
      (
        (await t.gql(CART, {}, { token: customer.accessToken })).data?.myCart as {
          subtotal: { amount: number };
        }
      ).subtotal.amount,
    ).toBe(9_900);
    const audit = await t.db
      .select()
      .from(schema.auditLogs)
      .where(
        and(eq(schema.auditLogs.entityId, variant.id), eq(schema.auditLogs.action, 'variant.price_changed')),
      );
    expect(audit[0]?.previousValue).toMatchObject({ priceAmount: 8_500 });
  });

  it('lists orders, payments, deliveries and promotions for staff with the right permissions only', async () => {
    const finance = await t.registerStaff('FINANCE');
    const customer = await shopper();
    const payments = await t.gql(
      '{ adminPayments { totalCount items { payment { status } customer { email } transactions { type } } } }',
      {},
      { token: finance.accessToken },
    );
    expect(payments.errors).toBeUndefined();
    expect((payments.data?.adminPayments as { totalCount: number }).totalCount).toBeGreaterThan(0);
    expect(
      errorCode(await t.gql('{ adminDeliveries { totalCount } }', {}, { token: finance.accessToken })),
    ).toBe('FORBIDDEN');
    expect(
      errorCode(await t.gql('{ adminOrders { totalCount } }', {}, { token: customer.accessToken })),
    ).toBe('FORBIDDEN');
    const orders = await t.gql(
      '{ adminOrders(status: DELIVERED) { items { order { status } customer { email exchangeCreditBalance { amount } } } } }',
      {},
      { token: finance.accessToken },
    );
    expect(orders.errors).toBeUndefined();
  });
});
