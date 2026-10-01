import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MOCK_WALLETS } from '../providers/payments';
import { type TestApp, createTestApp, errorCode, errorReason } from '../testing/test-app';

/** Admin customer search, the metrics dashboard and garment availability for subscriptions. */
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

const METRICS = `query ($start: DateTime!, $end: DateTime!) { adminMetrics(periodStart: $start, periodEnd: $end) {
  totalCustomers newCustomers activeSubscribers monthlyRecurringRevenue { amount currency }
  subscriptionRevenue { amount } oneTimeRevenue { amount } averageRevenuePerSubscriber { amount }
  paymentSuccessRate orders pendingOrders pendingReturns openExchangeRequests lowStockItems
  garmentsInCirculation garmentsReturned garmentsReused garmentsRecycled averageGarmentLifecycleCount
  subscriptionChurnRate customerRetentionRate onTimeDeliveryRate } }`;

/** A window that contains both the test clock (payments) and the database clock (account creation). */
function wideWindow() {
  const test = new Date('2026-10-01T08:00:00Z').getTime();
  const real = Date.now();
  return {
    start: new Date(Math.min(test, real) - 86_400_000).toISOString(),
    end: new Date(Math.max(test, real) + 86_400_000).toISOString(),
  };
}

async function subscribeAndPay(msisdn: string) {
  const account = await t.registerCustomer({ firstName: 'Umutoni', lastName: 'Keza' });
  const token = account.accessToken;
  const address = (
    await t.gql(
      'mutation ($input: AddressInput!) { createAddress(input: $input) { id } }',
      { input: kigali },
      { token },
    )
  ).data?.createAddress as { id: string };
  const baby = (
    await t.gql(
      'mutation { createBabyProfile(input: { nickname: "Seed", dateOfBirth: "2026-06-01" }) { id } }',
      {},
      { token },
    )
  ).data?.createBabyProfile as { id: string };
  const plans = (await t.gql('{ subscriptionPlans { id code price { amount } } }')).data
    ?.subscriptionPlans as {
    id: string;
    code: string;
    price: { amount: number };
  }[];
  const monthly = plans.find((p) => p.code === 'SEED-MONTHLY');
  const subscription = (
    await t.gql(
      'mutation ($input: CreateSubscriptionInput!) { createSubscription(input: $input) { id orderAwaitingPayment { id totals { total { amount } } } } }',
      {
        input: {
          idempotencyKey: randomUUID(),
          planId: monthly?.id,
          babyProfileId: baby.id,
          shippingAddressId: address.id,
          deliveryOptionCode: 'SEED-STANDARD',
        },
      },
      { token },
    )
  ).data?.createSubscription as {
    id: string;
    orderAwaitingPayment: { id: string; totals: { total: { amount: number } } };
  };
  const payment = (
    await t.gql(
      'mutation ($input: InitiatePaymentInput!) { initiatePayment(input: $input) { id } }',
      {
        input: {
          idempotencyKey: randomUUID(),
          orderId: subscription.orderAwaitingPayment.id,
          provider: 'MOCK',
          msisdn,
        },
      },
      { token },
    )
  ).data?.initiatePayment as { id: string };
  const status = (
    await t.gql('query ($id: ID!) { payment(id: $id) { status } }', { id: payment.id }, { token })
  ).data?.payment as { status: string };
  return {
    account,
    status: status.status,
    planPrice: monthly?.price.amount ?? 0,
    orderTotal: subscription.orderAwaitingPayment.totals.total.amount,
  };
}

describe('adminMetrics', () => {
  it('needs report:read', async () => {
    const support = await t.registerStaff('CUSTOMER_SUPPORT');
    const response = await t.gql(METRICS, wideWindow(), { token: support.accessToken });
    expect(errorCode(response)).toBe('FORBIDDEN');
  });

  it('rejects an empty or reversed period', async () => {
    const admin = await t.registerStaff('SUPER_ADMIN');
    const at = '2026-10-01T00:00:00Z';
    const response = await t.gql(METRICS, { start: at, end: at }, { token: admin.accessToken });
    expect(errorReason(response)).toBe('INVALID_PERIOD');
  });

  it('reports nulls, not invented numbers, before there is data to divide', async () => {
    const admin = await t.registerStaff('SUPER_ADMIN');
    const response = await t.gql(
      METRICS,
      { start: '2020-01-01T00:00:00Z', end: '2020-02-01T00:00:00Z' },
      { token: admin.accessToken },
    );
    expect(response.errors).toBeUndefined();
    expect(response.data?.adminMetrics).toMatchObject({
      newCustomers: 0,
      orders: 0,
      subscriptionRevenue: { amount: 0 },
      averageRevenuePerSubscriber: null,
      paymentSuccessRate: null,
      subscriptionChurnRate: null,
      customerRetentionRate: null,
      onTimeDeliveryRate: null,
    });
  });

  it('counts subscribers, recurring revenue, collected revenue and payment outcomes from real rows', async () => {
    const admin = await t.registerStaff('SUPER_ADMIN');
    const window = wideWindow();
    const before = (await t.gql(METRICS, window, { token: admin.accessToken })).data?.adminMetrics as Record<
      string,
      unknown
    > & {
      activeSubscribers: number;
      monthlyRecurringRevenue: { amount: number; currency: string };
      subscriptionRevenue: { amount: number };
      orders: number;
      pendingOrders: number;
      garmentsInCirculation: number;
    };

    const paid = await subscribeAndPay(MOCK_WALLETS.approves);
    expect(paid.status).toBe('SUCCEEDED');
    const declined = await subscribeAndPay(MOCK_WALLETS.declines);
    expect(declined.status).toBe('FAILED');

    const after = (await t.gql(METRICS, window, { token: admin.accessToken })).data
      ?.adminMetrics as typeof before & {
      paymentSuccessRate: number;
      averageRevenuePerSubscriber: { amount: number };
    };
    expect(after.activeSubscribers).toBe(before.activeSubscribers + 1);
    expect(after.monthlyRecurringRevenue.amount).toBe(before.monthlyRecurringRevenue.amount + paid.planPrice);
    expect(after.monthlyRecurringRevenue.currency).toBe('RWF');
    // Revenue is what was collected: the paid order's total (plan price plus delivery), not the declined one.
    expect(after.subscriptionRevenue.amount).toBe(before.subscriptionRevenue.amount + paid.orderTotal);
    expect(after.orders).toBe(before.orders + 2);
    expect(after.pendingOrders).toBe(before.pendingOrders + 1);
    expect(after.paymentSuccessRate).toBeGreaterThan(0);
    expect(after.paymentSuccessRate).toBeLessThan(1);
    expect(after.averageRevenuePerSubscriber.amount).toBeGreaterThan(0);
  });
});

describe('adminCustomers and adminCustomer', () => {
  const SEARCH = `query ($search: String) { adminCustomers(search: $search, page: { first: 50 }) {
    totalCount items { id email firstName lastName exchangeCreditBalance { amount } } } }`;

  it('needs customer:read', async () => {
    const customer = await t.registerCustomer();
    expect(errorCode(await t.gql(SEARCH, {}, { token: customer.accessToken }))).toBe('FORBIDDEN');
  });

  it('searches by name, email or phone, and ignores LIKE wildcards in the search text', async () => {
    const support = await t.registerStaff('CUSTOMER_SUPPORT');
    const target = await t.registerCustomer({
      firstName: 'Ishimwe',
      lastName: 'Mutesi',
      phone: '+250788765432',
    });
    const byName = (await t.gql(SEARCH, { search: 'ishimwe mut' }, { token: support.accessToken })).data
      ?.adminCustomers as {
      totalCount: number;
      items: { id: string; email: string }[];
    };
    expect(byName.items.map((c) => c.id)).toContain(target.userId);
    const byPhone = (await t.gql(SEARCH, { search: '765432' }, { token: support.accessToken })).data
      ?.adminCustomers as {
      items: { id: string }[];
    };
    expect(byPhone.items.map((c) => c.id)).toEqual([target.userId]);
    const wildcard = (await t.gql(SEARCH, { search: '%' }, { token: support.accessToken })).data
      ?.adminCustomers as {
      totalCount: number;
    };
    const everyone = (await t.gql(SEARCH, {}, { token: support.accessToken })).data?.adminCustomers as {
      totalCount: number;
    };
    // "%" is stripped, so it behaves like an empty search rather than a pattern.
    expect(wildcard.totalCount).toBe(everyone.totalCount);
  });

  it('shows one customer with credit; baby profiles need their own permission', async () => {
    const target = await t.registerCustomer();
    await t.gql(
      'mutation { createBabyProfile(input: { nickname: "Teta", dateOfBirth: "2026-05-01" }) { id } }',
      {},
      { token: target.accessToken },
    );
    const query =
      'query ($id: ID!) { adminCustomer(id: $id) { id exchangeCreditBalance { amount } babyProfiles { nickname } } }';

    const finance = await t.registerStaff('FINANCE');
    const withoutChildData = await t.gql(query, { id: target.userId }, { token: finance.accessToken });
    expect(errorCode(withoutChildData)).toBe('FORBIDDEN');

    const support = await t.registerStaff('CUSTOMER_SUPPORT');
    const full = (await t.gql(query, { id: target.userId }, { token: support.accessToken })).data
      ?.adminCustomer;
    expect(full).toMatchObject({
      id: target.userId,
      exchangeCreditBalance: { amount: 0 },
      babyProfiles: [{ nickname: 'Teta' }],
    });

    const missing = await t.gql(query, { id: randomUUID() }, { token: support.accessToken });
    expect(missing.data?.adminCustomer).toBeNull();
  });
});

describe('ProductVariant.availableForSubscription', () => {
  it('reflects reservable garments, not catalogue stock', async () => {
    const ops = await t.registerStaff('OPERATIONS_MANAGER');
    const product = (
      await t.gql(
        '{ product(slug: "seed-footed-romper") { variants { id sku inStock availableForSubscription } } }',
      )
    ).data?.product as {
      variants: { id: string; sku: string; inStock: boolean; availableForSubscription: boolean }[];
    };
    const variant = product.variants[0];
    expect(variant).toMatchObject({ inStock: true, availableForSubscription: true });

    // Retire every reservable garment of this variant: catalogue stock is unchanged, availability is not.
    const garments = (
      await t.gql(
        'query ($id: ID!) { adminGarments(variantId: $id, status: AVAILABLE, page: { first: 50 }) { items { id } } }',
        { id: variant?.id },
        { token: ops.accessToken },
      )
    ).data?.adminGarments as { items: { id: string }[] };
    for (const garment of garments.items) {
      const response = await t.gql(
        'mutation ($input: GarmentTransitionInput!) { adminTransitionGarment(input: $input) { id } }',
        { input: { garmentId: garment.id, status: 'RETIRED', note: 'test' } },
        { token: ops.accessToken },
      );
      expect(response.errors).toBeUndefined();
    }
    const after = (
      await t.gql(
        '{ product(slug: "seed-footed-romper") { variants { id inStock availableForSubscription } } }',
      )
    ).data?.product as { variants: { id: string; inStock: boolean; availableForSubscription: boolean }[] };
    expect(after.variants.find((v) => v.id === variant?.id)).toMatchObject({
      inStock: true,
      availableForSubscription: false,
    });
  });
});
