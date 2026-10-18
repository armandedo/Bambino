import { randomUUID } from 'node:crypto';
import { schema } from '@bambino/database';
import { and, eq } from '@bambino/database/orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type TestApp, createTestApp, errorReason } from '../testing/test-app';

/**
 * What a plan entitles the customer to, and the server-side guards on the exchange workflow
 * (docs/12-plans-and-exchanges.md). The subscription, its garments and the returns are written straight to the
 * database: the journeys through the API are covered in circular.test.ts, and these tests are about the rules.
 */
let t: TestApp;
let tagCounter = 0;

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

const CREATE_EXCHANGE = `mutation ($input: CreateExchangeInput!) {
  createExchange(input: $input) { id status replacementOrder { id totals { subtotal { amount } shipping { amount } total { amount } } } } }`;
const ALLOWANCE = `query ($id: ID!) { subscription(id: $id) { exchangeAllowance { limit used remaining resetsAt } } }`;

async function variantId(slug: string, size: string, color = 'Sand') {
  const response = await t.gql(
    'query ($slug: String!) { product(slug: $slug) { variants { id color size { code } } } }',
    { slug },
  );
  const variants = (
    response.data?.product as { variants: { id: string; color: string; size: { code: string } }[] }
  ).variants;
  const match = variants.find((v) => v.size.code === size && v.color === color);
  if (!match) throw new Error(`no ${slug} in ${size}`);
  return match.id;
}

/**
 * A customer on an active monthly plan who holds `garments` rented garments that have been returned and passed
 * inspection. `limit` is the plan's swaps per period (null = unlimited).
 */
async function scenario(options: {
  limit: number | null;
  garments: number;
  status?: 'ACTIVE' | 'PAUSED';
  rented?: boolean;
  inspected?: boolean;
}) {
  const { limit, garments, status = 'ACTIVE', rented = true, inspected = true } = options;
  const parent = await t.registerCustomer();
  const address = await t.gql(
    'mutation ($input: AddressInput!) { createAddress(input: $input) { id } }',
    { input: kigali },
    { token: parent.accessToken },
  );
  const addressId = (address.data?.createAddress as { id: string }).id;
  const baby = (
    await t.gql(
      'mutation ($input: CreateBabyProfileInput!) { createBabyProfile(input: $input) { id } }',
      { input: { nickname: 'Keza', dateOfBirth: '2026-06-01' } },
      { token: parent.accessToken },
    )
  ).data?.createBabyProfile as { id: string };

  const [plan] = await t.db
    .select()
    .from(schema.subscriptionPlans)
    .where(eq(schema.subscriptionPlans.code, 'SEED-MONTHLY'));
  if (!plan) throw new Error('seed plan missing');
  await t.db
    .update(schema.subscriptionPlans)
    .set({ exchangePolicy: { exchangesPerCycle: limit } })
    .where(eq(schema.subscriptionPlans.id, plan.id));

  const periodStart = new Date(Date.now() - 3_600_000);
  const [subscription] = await t.db
    .insert(schema.subscriptions)
    .values({
      userId: parent.userId,
      babyProfileId: baby.id,
      planId: plan.id,
      status,
      priceAmount: plan.priceAmount,
      currency: plan.currency,
      shippingAddressId: addressId,
      startedAt: periodStart,
      currentPeriodStart: periodStart,
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      nextBillingAt: new Date(Date.now() + 30 * 86_400_000),
    })
    .returning();
  if (!subscription) throw new Error('subscription insert failed');

  const [request] = await t.db
    .insert(schema.returnRequests)
    .values({
      returnNumber: `RET-ENT-${randomUUID().slice(0, 8)}`,
      userId: parent.userId,
      status: 'ACCEPTED',
      reason: 'OUTGROWN',
    })
    .returning();
  if (!request) throw new Error('return insert failed');

  const returnItems: string[] = [];
  const garmentIds: string[] = [];
  const held = await variantId('seed-organic-cotton-bodysuit', '3-6M');
  for (let index = 0; index < garments; index += 1) {
    const [garment] = await t.db
      .insert(schema.garments)
      .values({
        tagCode: `ENT-${++tagCounter}-${randomUUID().slice(0, 6)}`,
        variantId: held,
        status: 'RETURNED',
        condition: 'GOOD',
      })
      .returning();
    if (!garment) throw new Error('garment insert failed');
    garmentIds.push(garment.id);
    if (rented) {
      await t.db.insert(schema.subscriptionItems).values({
        subscriptionId: subscription.id,
        cycleNumber: 1,
        variantId: held,
        garmentId: garment.id,
        status: 'RETURNED',
      });
    }
    const [item] = await t.db
      .insert(schema.returnItems)
      .values({
        returnRequestId: request.id,
        garmentId: garment.id,
        ...(inspected
          ? { inspectedCondition: 'GOOD' as const, inspectedAt: new Date(), outcome: 'ACCEPTED' as const }
          : {}),
      })
      .returning();
    if (!item) throw new Error('return item insert failed');
    returnItems.push(item.id);
  }

  const nextSize = await variantId('seed-organic-cotton-bodysuit', '6-9M');
  // Each swap reserves a real replacement garment, so stock some for this scenario.
  for (let index = 0; index <= garments; index += 1) {
    await t.db.insert(schema.garments).values({
      tagCode: `ENT-STOCK-${++tagCounter}-${randomUUID().slice(0, 6)}`,
      variantId: nextSize,
      status: 'AVAILABLE',
      condition: 'NEW',
    });
  }

  /** Asks to swap the given returned garments (by position) for the next size. */
  function swap(positions: number[], idempotencyKey: string = randomUUID()) {
    return t.gql(
      CREATE_EXCHANGE,
      {
        input: {
          idempotencyKey,
          returnRequestId: request?.id,
          items: positions.map((position) => ({
            returnItemId: returnItems[position],
            requestedVariantId: nextSize,
          })),
          shippingAddressId: addressId,
          deliveryOptionCode: 'SEED-STANDARD',
        },
      },
      { token: parent.accessToken },
    );
  }

  async function allowance() {
    return (await t.gql(ALLOWANCE, { id: subscription?.id }, { token: parent.accessToken })).data
      ?.subscription as {
      exchangeAllowance: {
        limit: number | null;
        used: number;
        remaining: number | null;
        resetsAt: string | null;
      };
    };
  }

  return { parent, subscription, request, returnItems, garmentIds, swap, allowance, addressId };
}

type Created = {
  id: string;
  status: string;
  replacementOrder: { id: string; totals: Record<string, { amount: number }> };
};
const created = (response: {
  data?: Record<string, unknown> | null | undefined;
  errors?: { message?: string; extensions?: Record<string, unknown> }[] | undefined;
}) => {
  if (!response.data?.createExchange)
    throw new Error(`createExchange failed: ${JSON.stringify(response.errors)}`);
  return response.data.createExchange as Created;
};

describe('plan entitlements', () => {
  it('includes a swap in the plan: only the delivery fee is charged', async () => {
    const s = await scenario({ limit: 5, garments: 1 });
    const exchange = created(await s.swap([0]));

    expect(exchange.status).toBe('REQUESTED');
    expect(exchange.replacementOrder.totals).toMatchObject({
      subtotal: { amount: 0 },
      shipping: { amount: 2_000 },
      total: { amount: 2_000 },
    });
    const [row] = await t.db.select().from(schema.exchanges).where(eq(schema.exchanges.id, exchange.id));
    expect(row?.subscriptionId).toBe(s.subscription.id);
  });

  it('refuses a swap beyond the allowance, and says how many are left', async () => {
    const s = await scenario({ limit: 1, garments: 2 });
    expect(created(await s.swap([0])).status).toBe('REQUESTED');

    const second = await s.swap([1]);
    expect(errorReason(second)).toBe('EXCHANGE_ALLOWANCE_EXCEEDED');
    expect(second.errors?.[0]?.message).toMatch(/includes 1 swap per billing period and 1 is already used/);
  });

  it('counts garments, not requests', async () => {
    const s = await scenario({ limit: 2, garments: 3 });
    expect(errorReason(await s.swap([0, 1, 2]))).toBe('EXCHANGE_ALLOWANCE_EXCEEDED');
    expect(created(await s.swap([0, 1])).status).toBe('REQUESTED');
    expect((await s.allowance()).exchangeAllowance).toMatchObject({ limit: 2, used: 2, remaining: 0 });
  });

  it('shows the allowance and when it restarts', async () => {
    const s = await scenario({ limit: 5, garments: 2 });
    await s.swap([0]);
    const { exchangeAllowance } = await s.allowance();
    expect(exchangeAllowance).toMatchObject({ limit: 5, used: 1, remaining: 4 });
    expect(exchangeAllowance.resetsAt).toEqual(expect.any(String));
  });

  it('gives a swap back when the exchange is rejected', async () => {
    const s = await scenario({ limit: 1, garments: 2 });
    const first = created(await s.swap([0]));
    const staff = await t.registerStaff('OPERATIONS_MANAGER');
    const rejected = await t.gql(
      'mutation ($id: ID!, $reason: String!) { adminRejectExchange(id: $id, reason: $reason) { status } }',
      { id: first.id, reason: 'Garment not returned' },
      { token: staff.accessToken },
    );
    expect(rejected.data?.adminRejectExchange).toEqual({ status: 'REJECTED' });

    expect((await s.allowance()).exchangeAllowance.used).toBe(0);
    expect(created(await s.swap([1])).status).toBe('REQUESTED');
  });

  it('starts the allowance again in the next billing period, with no carry-over', async () => {
    const s = await scenario({ limit: 1, garments: 2 });
    expect(created(await s.swap([0])).status).toBe('REQUESTED');
    expect(errorReason(await s.swap([1]))).toBe('EXCHANGE_ALLOWANCE_EXCEEDED');

    // The renewal moves the period start past the earlier swap.
    await t.db
      .update(schema.subscriptions)
      .set({ currentPeriodStart: new Date(Date.now() + 60_000) })
      .where(eq(schema.subscriptions.id, s.subscription.id));
    expect((await s.allowance()).exchangeAllowance).toMatchObject({ used: 0, remaining: 1 });
    expect(created(await s.swap([1])).status).toBe('REQUESTED');
  });

  it('does not limit a plan with unlimited swaps', async () => {
    const s = await scenario({ limit: null, garments: 3 });
    for (const position of [0, 1, 2]) expect(created(await s.swap([position])).status).toBe('REQUESTED');
    expect((await s.allowance()).exchangeAllowance).toMatchObject({ limit: null, used: 3, remaining: null });
  });

  it('allows swaps only while the subscription is active', async () => {
    const s = await scenario({ limit: 5, garments: 1, status: 'PAUSED' });
    expect(errorReason(await s.swap([0]))).toBe('SUBSCRIPTION_NOT_ACTIVE');
  });

  it('uses no allowance for garments the customer bought', async () => {
    const s = await scenario({ limit: 0, garments: 1, rented: false });
    const exchange = created(await s.swap([0]));
    expect(exchange.status).toBe('REQUESTED');
    // Priced at the catalogue price, since it is not covered by a plan.
    expect(exchange.replacementOrder.totals.subtotal?.amount).toBe(8_500);
    const [row] = await t.db.select().from(schema.exchanges).where(eq(schema.exchanges.id, exchange.id));
    expect(row?.subscriptionId).toBeNull();
  });
});

describe('exchange workflow guards', () => {
  it('will not approve a replacement until the returned garment has passed inspection', async () => {
    const s = await scenario({ limit: 5, garments: 1, inspected: false });
    const exchange = created(await s.swap([0]));
    const staff = await t.registerStaff('OPERATIONS_MANAGER');
    const APPROVE = 'mutation ($id: ID!) { adminApproveExchange(id: $id) { status } }';

    const early = await t.gql(APPROVE, { id: exchange.id }, { token: staff.accessToken });
    expect(errorReason(early)).toBe('RETURN_NOT_ACCEPTED');

    await t.db
      .update(schema.returnItems)
      .set({ inspectedCondition: 'GOOD', inspectedAt: new Date(), outcome: 'ACCEPTED' })
      .where(eq(schema.returnItems.id, s.returnItems[0] ?? ''));
    const approved = await t.gql(APPROVE, { id: exchange.id }, { token: staff.accessToken });
    expect(approved.data?.adminApproveExchange).toEqual({ status: 'APPROVED' });
  });

  it('will not approve when inspection rejected the garment', async () => {
    const s = await scenario({ limit: 5, garments: 1 });
    await t.db
      .update(schema.returnItems)
      .set({ outcome: 'REJECTED' })
      .where(eq(schema.returnItems.id, s.returnItems[0] ?? ''));
    const exchange = created(await s.swap([0]));
    const staff = await t.registerStaff('OPERATIONS_MANAGER');
    const response = await t.gql(
      'mutation ($id: ID!) { adminApproveExchange(id: $id) { status } }',
      { id: exchange.id },
      { token: staff.accessToken },
    );
    expect(errorReason(response)).toBe('RETURN_NOT_ACCEPTED');
  });

  it('cannot approve the same exchange twice', async () => {
    const s = await scenario({ limit: 5, garments: 1 });
    const exchange = created(await s.swap([0]));
    const staff = await t.registerStaff('OPERATIONS_MANAGER');
    const APPROVE = 'mutation ($id: ID!) { adminApproveExchange(id: $id) { status } }';
    expect((await t.gql(APPROVE, { id: exchange.id }, { token: staff.accessToken })).errors).toBeUndefined();
    expect((await t.gql(APPROVE, { id: exchange.id }, { token: staff.accessToken })).errors).toBeDefined();
  });

  it('answers a repeated request with the same exchange: one order, one swap used', async () => {
    const s = await scenario({ limit: 5, garments: 1 });
    const key = randomUUID();
    const first = created(await s.swap([0], key));
    const again = created(await s.swap([0], key));

    expect(again.id).toBe(first.id);
    expect(again.replacementOrder.id).toBe(first.replacementOrder.id);
    const exchanges = await t.db
      .select()
      .from(schema.exchanges)
      .where(eq(schema.exchanges.userId, s.parent.userId));
    expect(exchanges).toHaveLength(1);
    expect((await s.allowance()).exchangeAllowance.used).toBe(1);
  });

  it('will not put one returned garment in two exchanges', async () => {
    const s = await scenario({ limit: 5, garments: 1 });
    expect(created(await s.swap([0])).status).toBe('REQUESTED');
    expect(errorReason(await s.swap([0]))).toBe('RETURN_ITEM_ALREADY_EXCHANGED');
  });

  it('will not let two open pickups exist for one return', async () => {
    const s = await scenario({ limit: 5, garments: 1 });
    const pickup = {
      direction: 'RETURN_PICKUP' as const,
      returnRequestId: s.request.id,
      address: { ...kigali, street: null, directions: null },
      phone: kigali.phone,
      deliveryProvider: 'test',
      status: 'PENDING' as const,
    };
    await t.db.insert(schema.deliveries).values(pickup);
    await expect(t.db.insert(schema.deliveries).values(pickup)).rejects.toThrow();

    // A failed run does not block arranging a new one.
    await t.db
      .update(schema.deliveries)
      .set({ status: 'FAILED' })
      .where(
        and(
          eq(schema.deliveries.returnRequestId, s.request.id),
          eq(schema.deliveries.direction, 'RETURN_PICKUP'),
        ),
      );
    await expect(t.db.insert(schema.deliveries).values(pickup)).resolves.toBeDefined();
  });
});
