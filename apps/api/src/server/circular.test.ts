import { randomUUID } from 'node:crypto';
import { schema } from '@bambino/database';
import { and, eq } from '@bambino/database/orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MOCK_WALLETS } from '../providers/payments';
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

const CREATE_BABY =
  'mutation ($input: CreateBabyProfileInput!) { createBabyProfile(input: $input) { id nickname ageInDays fitPreference latestMeasurement { heightMm weightG } } }';
const RECOMMEND = `mutation ($id: ID!) { createSizingRecommendation(babyProfileId: $id) {
  id provider confidence recommendedSize { code } nextSize { code } explanation { key params { name value } } } }`;
const SUBSCRIBE =
  'mutation ($input: CreateSubscriptionInput!) { createSubscription(input: $input) { id status orderAwaitingPayment { id totals { total { amount } } } } }';
const SUBSCRIPTION = `query ($id: ID!) { subscription(id: $id) { id status currentPeriodEnd canPause canCancel
  items { status garmentTagCode variant { sku } } history { type status } orderAwaitingPayment { id } } }`;
const PAY = 'mutation ($input: InitiatePaymentInput!) { initiatePayment(input: $input) { id status } }';
const PAYMENT = 'query ($id: ID!) { payment(id: $id) { status } }';
const ORDER_STATUS =
  'mutation ($id: ID!, $status: OrderStatus!) { adminUpdateOrderStatus(orderId: $id, status: $status) { status } }';
const DELIVERY = 'mutation ($input: DeliveryUpdateInput!) { adminUpdateDelivery(input: $input) { status } }';

async function customerWithAddress() {
  const account = await t.registerCustomer();
  const address = await t.gql(
    'mutation ($input: AddressInput!) { createAddress(input: $input) { id } }',
    { input: kigali },
    { token: account.accessToken },
  );
  return { ...account, addressId: (address.data?.createAddress as { id: string }).id };
}

async function variant(slug: string, size: string, color?: string) {
  const response = await t.gql(
    'query ($slug: String!) { product(slug: $slug) { variants { id sku color price { amount } size { code } } } }',
    { slug },
  );
  const variants = (
    response.data?.product as {
      variants: {
        id: string;
        sku: string;
        color: string;
        price: { amount: number };
        size: { code: string };
      }[];
    }
  ).variants;
  const match = variants.find(
    (candidate) => candidate.size.code === size && (!color || candidate.color === color),
  );
  if (!match) throw new Error(`no ${slug} in ${size}`);
  return match;
}

async function seedPlanId(code = 'SEED-MONTHLY') {
  const plans = (await t.gql('{ subscriptionPlans { id code price { amount } itemsPerCycle } }')).data
    ?.subscriptionPlans as { id: string; code: string }[];
  const plan = plans.find((candidate) => candidate.code === code);
  if (!plan) throw new Error(`plan ${code} missing`);
  return plan.id;
}

async function payOrder(token: string, orderId: string) {
  const payment = (
    await t.gql(
      PAY,
      { input: { idempotencyKey: randomUUID(), orderId, provider: 'MOCK', msisdn: MOCK_WALLETS.approves } },
      { token },
    )
  ).data?.initiatePayment as { id: string };
  return t.gql(PAYMENT, { id: payment.id }, { token });
}

/** Staff move a paid order through the warehouse and deliver it. */
async function fulfil(orderId: string) {
  const ops = await t.registerStaff('OPERATIONS_MANAGER');
  for (const status of ['PROCESSING', 'PACKED', 'READY_FOR_DISPATCH']) {
    const response = await t.gql(ORDER_STATUS, { id: orderId, status }, { token: ops.accessToken });
    if (response.errors) throw new Error(JSON.stringify(response.errors));
  }
  const [delivery] = await t.db
    .select()
    .from(schema.deliveries)
    .where(and(eq(schema.deliveries.orderId, orderId), eq(schema.deliveries.direction, 'OUTBOUND')));
  for (const status of ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED']) {
    const response = await t.gql(
      DELIVERY,
      { input: { deliveryId: delivery?.id, status } },
      { token: ops.accessToken },
    );
    if (response.errors) throw new Error(JSON.stringify(response.errors));
  }
}

describe('baby profiles and sizing', () => {
  it('creates a profile with a measurement and recommends a size with its reasons', async () => {
    const parent = await t.registerCustomer();
    const baby = (
      await t.gql(
        CREATE_BABY,
        {
          input: {
            nickname: 'Keza',
            dateOfBirth: '2026-06-01',
            measurement: { heightMm: 640, weightG: 7_000 },
          },
        },
        { token: parent.accessToken },
      )
    ).data?.createBabyProfile as { id: string; ageInDays: number; fitPreference: string };
    expect(baby).toMatchObject({ ageInDays: 122, fitPreference: 'REGULAR' });

    const recommendation = (await t.gql(RECOMMEND, { id: baby.id }, { token: parent.accessToken })).data
      ?.createSizingRecommendation;
    expect(recommendation).toMatchObject({
      provider: 'rules',
      confidence: 0.9,
      recommendedSize: { code: '3-6M' },
      nextSize: { code: '6-9M' },
      explanation: [
        { key: 'sizing.reason.height_and_weight_agree', params: [{ name: 'size', value: '3-6M' }] },
        { key: 'sizing.reason.next_size' },
      ],
    });

    const [snapshot] = await t.db
      .select()
      .from(schema.sizingMeasurements)
      .where(eq(schema.sizingMeasurements.recommendationId, (recommendation as { id: string }).id));
    expect(snapshot).toMatchObject({ ageDays: 122, heightMm: 640, weightG: 7_000, fitPreference: 'REGULAR' });
  });

  it('moves up a size after repeated "too small" reports', async () => {
    const parent = await t.registerCustomer();
    const baby = (
      await t.gql(
        CREATE_BABY,
        {
          input: {
            nickname: 'Ganza',
            dateOfBirth: '2026-06-01',
            measurement: { heightMm: 640, weightG: 7_000 },
          },
        },
        { token: parent.accessToken },
      )
    ).data?.createBabyProfile as { id: string };
    const first = (await t.gql(RECOMMEND, { id: baby.id }, { token: parent.accessToken })).data
      ?.createSizingRecommendation as { id: string };
    const feedback =
      'mutation ($id: ID!) { submitFitFeedback(recommendationId: $id, sizeCode: "3-6M", outcome: TOO_SMALL) }';
    await t.gql(feedback, { id: first.id }, { token: parent.accessToken });
    await t.gql(feedback, { id: first.id }, { token: parent.accessToken });
    const second = (await t.gql(RECOMMEND, { id: baby.id }, { token: parent.accessToken })).data
      ?.createSizingRecommendation as {
      recommendedSize: { code: string };
      explanation: { key: string }[];
    };
    expect(second.recommendedSize.code).toBe('6-9M');
    expect(second.explanation.map((reason) => reason.key)).toContain('sizing.reason.history_too_small');
  });

  it("keeps each family's child data private", async () => {
    const parent = await t.registerCustomer();
    const stranger = await t.registerCustomer();
    const baby = (
      await t.gql(
        CREATE_BABY,
        { input: { nickname: 'Mugisha', dateOfBirth: '2026-03-01' } },
        { token: parent.accessToken },
      )
    ).data?.createBabyProfile as { id: string };

    expect(
      (
        await t.gql(
          'query ($id: ID!) { babyProfile(id: $id) { id } }',
          { id: baby.id },
          { token: stranger.accessToken },
        )
      ).data?.babyProfile,
    ).toBeNull();
    expect(errorCode(await t.gql(RECOMMEND, { id: baby.id }, { token: stranger.accessToken }))).toBe(
      'NOT_FOUND',
    );
    expect(
      errorCode(
        await t.gql(
          'mutation ($id: ID!) { addBabyMeasurement(babyProfileId: $id, input: { heightMm: 600 }) { id } }',
          { id: baby.id },
          { token: stranger.accessToken },
        ),
      ),
    ).toBe('NOT_FOUND');

    // Staff need baby_profile:read, and every read is audited.
    const finance = await t.registerStaff('FINANCE');
    const support = await t.registerStaff('CUSTOMER_SUPPORT');
    const query = 'query ($id: ID!) { adminBabyProfiles(customerId: $id) { nickname } }';
    expect(errorCode(await t.gql(query, { id: parent.userId }, { token: finance.accessToken }))).toBe(
      'FORBIDDEN',
    );
    expect(
      (await t.gql(query, { id: parent.userId }, { token: support.accessToken })).data?.adminBabyProfiles,
    ).toEqual([{ nickname: 'Mugisha' }]);
    const audit = await t.db
      .select()
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.action, 'baby_profile.viewed_by_staff'),
          eq(schema.auditLogs.entityId, parent.userId),
        ),
      );
    expect(audit).toHaveLength(1);
  });

  it('rejects implausible dates of birth and measurements', async () => {
    const parent = await t.registerCustomer();
    expect(
      errorReason(
        await t.gql(
          CREATE_BABY,
          { input: { nickname: 'X', dateOfBirth: '2010-01-01' } },
          { token: parent.accessToken },
        ),
      ),
    ).toBe('INVALID_DATE_OF_BIRTH');
    expect(
      errorCode(
        await t.gql(
          CREATE_BABY,
          { input: { nickname: 'X', dateOfBirth: '2026-06-01', measurement: { heightMm: 5 } } },
          { token: parent.accessToken },
        ),
      ),
    ).toBe('VALIDATION_FAILED');
  });
});

describe('journeys', () => {
  /** State shared by the journeys below, which run in order. */
  const journey: {
    parent?: Awaited<ReturnType<typeof customerWithAddress>>;
    subscriptionId?: string;
    returnId?: string;
    returnItemIds?: string[];
    bodysuitGarmentId?: string | undefined;
  } = {};

  it('A: register, profile, sizing, subscribe, choose items, pay, deliver', async () => {
    const parent = await customerWithAddress();
    journey.parent = parent;
    const baby = (
      await t.gql(
        CREATE_BABY,
        {
          input: {
            nickname: 'Shema',
            dateOfBirth: '2026-06-01',
            measurement: { heightMm: 640, weightG: 7_000 },
          },
        },
        { token: parent.accessToken },
      )
    ).data?.createBabyProfile as { id: string };
    const size = (
      (await t.gql(RECOMMEND, { id: baby.id }, { token: parent.accessToken })).data
        ?.createSizingRecommendation as { recommendedSize: { code: string } }
    ).recommendedSize.code;

    const created = await t.gql(
      SUBSCRIBE,
      {
        input: {
          idempotencyKey: randomUUID(),
          planId: await seedPlanId(),
          babyProfileId: baby.id,
          shippingAddressId: parent.addressId,
          deliveryOptionCode: 'SEED-STANDARD',
        },
      },
      { token: parent.accessToken },
    );
    const subscription = created.data?.createSubscription as {
      id: string;
      status: string;
      orderAwaitingPayment: { id: string; totals: { total: { amount: number } } };
    };
    expect(subscription).toMatchObject({
      status: 'PENDING',
      orderAwaitingPayment: { totals: { total: { amount: 41_000 } } },
    });
    journey.subscriptionId = subscription.id;

    // A second live subscription for the same baby is refused.
    const duplicate = await t.gql(
      SUBSCRIBE,
      {
        input: {
          idempotencyKey: randomUUID(),
          planId: await seedPlanId(),
          babyProfileId: baby.id,
          shippingAddressId: parent.addressId,
          deliveryOptionCode: 'SEED-STANDARD',
        },
      },
      { token: parent.accessToken },
    );
    expect(errorReason(duplicate)).toBe('SUBSCRIPTION_EXISTS');

    const items = [
      await variant('seed-organic-cotton-bodysuit', size, 'Sand'),
      await variant('seed-footed-romper', size),
      await variant('seed-sleep-suit', size),
    ];
    const selected = await t.gql(
      'mutation ($id: ID!, $variants: [ID!]!) { selectSubscriptionItems(id: $id, variantIds: $variants) { id } }',
      { id: subscription.id, variants: items.map((item) => item.id) },
      { token: parent.accessToken },
    );
    expect(selected.errors).toBeUndefined();

    expect((await payOrder(parent.accessToken, subscription.orderAwaitingPayment.id)).data?.payment).toEqual({
      status: 'SUCCEEDED',
    });
    const active = (await t.gql(SUBSCRIPTION, { id: subscription.id }, { token: parent.accessToken })).data
      ?.subscription as {
      status: string;
      currentPeriodEnd: string;
      items: { status: string; garmentTagCode: string; variant: { sku: string } }[];
      history: { type: string }[];
    };
    expect(active).toMatchObject({
      status: 'ACTIVE',
      currentPeriodEnd: '2026-11-01T08:00:00.000Z',
      canPause: true,
    });
    expect(active.items.map((item) => item.status)).toEqual(['SELECTED', 'SELECTED', 'SELECTED']);
    expect(active.items.every((item) => item.garmentTagCode.startsWith(item.variant.sku))).toBe(true);
    expect(active.history.map((event) => event.type)).toEqual(['CREATED', 'ACTIVATED']);

    await fulfil(subscription.orderAwaitingPayment.id);
    const garments = (
      await t.gql(
        '{ myGarments { id tagCode status size { code } receivedAt } }',
        {},
        { token: parent.accessToken },
      )
    ).data?.myGarments as {
      id: string;
      tagCode: string;
      status: string;
      receivedAt: string;
    }[];
    expect(garments).toHaveLength(3);
    expect(garments.every((garment) => garment.status === 'WITH_CUSTOMER' && garment.receivedAt)).toBe(true);
    journey.bodysuitGarmentId = garments.find((garment) => garment.tagCode.includes('ORGANIC'))?.id;
    const delivered = (await t.gql(SUBSCRIPTION, { id: subscription.id }, { token: parent.accessToken })).data
      ?.subscription as { items: { status: string }[] };
    expect(delivered.items.every((item) => item.status === 'WITH_CUSTOMER')).toBe(true);
  });

  it('B: return with pickup, inspection, credit, exchange for the next size, delivery', async () => {
    const parent = journey.parent;
    if (!parent || !journey.bodysuitGarmentId) throw new Error('journey A must run first');
    const held = (await t.gql('{ myGarments { id tagCode } }', {}, { token: parent.accessToken })).data
      ?.myGarments as { id: string; tagCode: string }[];
    const other = held.find((garment) => garment.id !== journey.bodysuitGarmentId);

    const requested = await t.gql(
      'mutation ($input: RequestReturnInput!) { requestReturn(input: $input) { id status returnNumber items { id garment { id status } reportedFit } pickup { status } } }',
      {
        input: {
          reason: 'OUTGROWN',
          pickupAddressId: parent.addressId,
          items: [
            { garmentId: journey.bodysuitGarmentId, reportedFit: 'TOO_SMALL' },
            { garmentId: other?.id, reportedFit: 'TOO_SMALL' },
          ],
        },
      },
      { token: parent.accessToken },
    );
    const request = requested.data?.requestReturn as {
      id: string;
      returnNumber: string;
      items: { id: string; garment: { id: string; status: string } }[];
      pickup: { status: string };
    };
    expect(request).toMatchObject({ status: 'REQUESTED', pickup: { status: 'PENDING' } });
    expect(request.returnNumber).toMatch(/^RET-/);
    expect(request.items.every((item) => item.garment.status === 'RETURN_REQUESTED')).toBe(true);
    journey.returnId = request.id;

    // A garment cannot be in two returns at once.
    expect(
      errorReason(
        await t.gql(
          'mutation ($input: RequestReturnInput!) { requestReturn(input: $input) { id } }',
          { input: { reason: 'OUTGROWN', items: [{ garmentId: journey.bodysuitGarmentId }] } },
          { token: parent.accessToken },
        ),
      ),
    ).toBe('GARMENT_NOT_RETURNABLE');

    const ops = await t.registerStaff('OPERATIONS_MANAGER');
    expect(
      (
        await t.gql(
          'mutation ($id: ID!) { adminApproveReturn(id: $id) { status } }',
          { id: request.id },
          { token: ops.accessToken },
        )
      ).data?.adminApproveReturn,
    ).toEqual({ status: 'APPROVED' });
    const [pickup] = await t.db
      .select()
      .from(schema.deliveries)
      .where(eq(schema.deliveries.returnRequestId, request.id));
    for (const status of ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED']) {
      const response = await t.gql(
        DELIVERY,
        { input: { deliveryId: pickup?.id, status } },
        { token: ops.accessToken },
      );
      expect(response.errors).toBeUndefined();
    }
    const received = (
      await t.gql(
        'query ($id: ID!) { returnRequest(id: $id) { status items { garment { status } } } }',
        { id: request.id },
        { token: parent.accessToken },
      )
    ).data?.returnRequest as {
      status: string;
      items: { garment: { status: string } | null }[];
    };
    expect(received.status).toBe('RECEIVED');

    const inspect = `mutation ($input: InspectionInput!) { adminRecordInspection(input: $input) { status items { outcome inspectedCondition creditEarned { amount } } } }`;
    const bodysuitItem = request.items.find((item) => item.garment.id === journey.bodysuitGarmentId);
    const otherItem = request.items.find((item) => item.garment.id !== journey.bodysuitGarmentId);
    const firstInspection = await t.gql(
      inspect,
      {
        input: {
          returnItemId: bodysuitItem?.id,
          condition: 'EXCELLENT',
          outcome: 'ACCEPTED',
          garmentStatus: 'AVAILABLE_FOR_REUSE',
        },
      },
      { token: ops.accessToken },
    );
    expect(firstInspection.data?.adminRecordInspection).toMatchObject({ status: 'INSPECTING' });
    const secondInspection = await t.gql(
      inspect,
      {
        input: {
          returnItemId: otherItem?.id,
          condition: 'DAMAGED',
          outcome: 'REJECTED',
          garmentStatus: 'RECYCLE',
          notes: 'Torn seam',
        },
      },
      { token: ops.accessToken },
    );
    const inspected = secondInspection.data?.adminRecordInspection as {
      status: string;
      items: { outcome: string; creditEarned: { amount: number } | null }[];
    };
    expect(inspected.status).toBe('ACCEPTED');
    // EXCELLENT earns 40% of the bodysuit's 8,500 (placeholder policy); a rejected garment earns nothing.
    expect(inspected.items.map((item) => item.creditEarned?.amount ?? null).sort()).toEqual([3_400, null]);
    expect(
      errorReason(
        await t.gql(
          inspect,
          {
            input: {
              returnItemId: bodysuitItem?.id,
              condition: 'GOOD',
              outcome: 'ACCEPTED',
              garmentStatus: 'AVAILABLE_FOR_REUSE',
            },
          },
          { token: ops.accessToken },
        ),
      ),
    ).toBe('ALREADY_INSPECTED');

    const [reused] = await t.db
      .select()
      .from(schema.garments)
      .where(eq(schema.garments.id, journey.bodysuitGarmentId));
    expect(reused).toMatchObject({
      status: 'AVAILABLE_FOR_REUSE',
      condition: 'EXCELLENT',
      lifecycleCount: 1,
      currentCustomerId: null,
    });
    const credits = (
      await t.gql('{ myExchangeCredits { balance { amount } } }', {}, { token: parent.accessToken })
    ).data?.myExchangeCredits;
    expect(credits).toEqual({ balance: { amount: 3_400 } });

    const nextSize = await variant('seed-organic-cotton-bodysuit', '6-9M', 'Sand');
    const exchangeInput = {
      idempotencyKey: randomUUID(),
      returnRequestId: request.id,
      items: [{ returnItemId: bodysuitItem?.id, requestedVariantId: nextSize.id }],
      shippingAddressId: parent.addressId,
      deliveryOptionCode: 'SEED-STANDARD',
    };
    const EXCHANGE =
      'mutation ($input: CreateExchangeInput!) { createExchange(input: $input) { id status exchangeNumber replacementOrder { id status totals { subtotal { amount } creditApplied { amount } total { amount } } } } }';
    const exchange = (await t.gql(EXCHANGE, { input: exchangeInput }, { token: parent.accessToken })).data
      ?.createExchange as {
      id: string;
      replacementOrder: { id: string; totals: unknown };
    };
    expect(exchange).toMatchObject({
      status: 'REQUESTED',
      replacementOrder: {
        status: 'PENDING_PAYMENT',
        totals: { subtotal: { amount: 8_500 }, creditApplied: { amount: 3_400 }, total: { amount: 7_100 } },
      },
    });
    expect(
      (await t.gql(EXCHANGE, { input: exchangeInput }, { token: parent.accessToken })).data?.createExchange,
    ).toMatchObject({ id: exchange.id });

    const early = await t.gql(
      PAY,
      {
        input: {
          idempotencyKey: randomUUID(),
          orderId: exchange.replacementOrder.id,
          provider: 'MOCK',
          msisdn: MOCK_WALLETS.approves,
        },
      },
      { token: parent.accessToken },
    );
    expect(errorReason(early)).toBe('EXCHANGE_NOT_APPROVED');

    expect(
      (
        await t.gql(
          'mutation ($id: ID!) { adminApproveExchange(id: $id) { status } }',
          { id: exchange.id },
          { token: ops.accessToken },
        )
      ).data?.adminApproveExchange,
    ).toEqual({ status: 'APPROVED' });
    await payOrder(parent.accessToken, exchange.replacementOrder.id);
    const fulfilling = (await t.gql('{ myExchanges { id status } }', {}, { token: parent.accessToken })).data
      ?.myExchanges as { id: string; status: string }[];
    expect(fulfilling.find((entry) => entry.id === exchange.id)?.status).toBe('FULFILLING');

    await fulfil(exchange.replacementOrder.id);
    const done = (
      await t.gql(
        '{ myExchanges { id status completedAt items { requestedVariant { sku } } } }',
        {},
        { token: parent.accessToken },
      )
    ).data?.myExchanges as {
      id: string;
      status: string;
    }[];
    expect(done.find((entry) => entry.id === exchange.id)).toMatchObject({
      status: 'COMPLETED',
      completedAt: expect.any(String),
    });
    const nowHeld = (await t.gql('{ myGarments { tagCode } }', {}, { token: parent.accessToken })).data
      ?.myGarments as { tagCode: string }[];
    expect(nowHeld.some((garment) => garment.tagCode.startsWith(nextSize.sku))).toBe(true);

    expect(
      (
        await t.gql(
          'mutation ($id: ID!) { adminCompleteReturn(id: $id) { status completedAt } }',
          { id: request.id },
          { token: ops.accessToken },
        )
      ).data?.adminCompleteReturn,
    ).toMatchObject({
      status: 'COMPLETED',
    });
  });

  it('C: an inspected garment goes back into circulation and is preferred for the next customer', async () => {
    if (!journey.bodysuitGarmentId) throw new Error('journey B must run first');
    const events = await t.db
      .select()
      .from(schema.garmentLifecycleEvents)
      .where(eq(schema.garmentLifecycleEvents.garmentId, journey.bodysuitGarmentId));
    expect(events.map((event) => event.newStatus)).toEqual([
      'PROCURED',
      'AVAILABLE',
      'RESERVED',
      'WITH_CUSTOMER',
      'RETURN_REQUESTED',
      'RETURNED',
      'INSPECTION',
      'AVAILABLE_FOR_REUSE',
    ]);

    const nextParent = await customerWithAddress();
    const baby = (
      await t.gql(
        CREATE_BABY,
        { input: { nickname: 'Ineza', dateOfBirth: '2026-06-01' } },
        { token: nextParent.accessToken },
      )
    ).data?.createBabyProfile as { id: string };
    const subscription = (
      await t.gql(
        SUBSCRIBE,
        {
          input: {
            idempotencyKey: randomUUID(),
            planId: await seedPlanId(),
            babyProfileId: baby.id,
            shippingAddressId: nextParent.addressId,
            deliveryOptionCode: 'SEED-STANDARD',
          },
        },
        { token: nextParent.accessToken },
      )
    ).data?.createSubscription as { id: string };
    const sameVariant = await variant('seed-organic-cotton-bodysuit', '3-6M', 'Sand');
    await t.gql(
      'mutation ($id: ID!, $variants: [ID!]!) { selectSubscriptionItems(id: $id, variantIds: $variants) { id } }',
      { id: subscription.id, variants: [sameVariant.id] },
      { token: nextParent.accessToken },
    );
    const [garment] = await t.db
      .select()
      .from(schema.garments)
      .where(eq(schema.garments.id, journey.bodysuitGarmentId));
    expect(garment?.status).toBe('RESERVED');
  });
});

describe('exchange rejection and staff garment controls', () => {
  it('rejecting an exchange frees the reserved garment and returns the credit', async () => {
    const parent = await customerWithAddress();
    await t.db.insert(schema.exchangeCredits).values({
      userId: parent.userId,
      entryType: 'ADJUSTMENT',
      amount: 5_000,
      currency: 'RWF',
      note: 'test credit',
    });
    const target = await variant('seed-sleep-suit', '9-12M');
    const exchange = (
      await t.gql(
        'mutation ($input: CreateExchangeInput!) { createExchange(input: $input) { id replacementOrder { id } } }',
        {
          input: {
            idempotencyKey: randomUUID(),
            items: [{ requestedVariantId: target.id }],
            shippingAddressId: parent.addressId,
            deliveryOptionCode: 'SEED-STANDARD',
          },
        },
        { token: parent.accessToken },
      )
    ).data?.createExchange as { id: string; replacementOrder: { id: string } };
    const [line] = await t.db
      .select()
      .from(schema.orderItems)
      .where(eq(schema.orderItems.orderId, exchange.replacementOrder.id));

    const support = await t.registerStaff('CUSTOMER_SUPPORT');
    const rejected = await t.gql(
      'mutation ($id: ID!) { adminRejectExchange(id: $id, reason: "Out of policy") { status replacementOrder { status } } }',
      { id: exchange.id },
      { token: support.accessToken },
    );
    expect(rejected.data?.adminRejectExchange).toEqual({
      status: 'REJECTED',
      replacementOrder: { status: 'CANCELLED' },
    });
    const [garment] = await t.db
      .select()
      .from(schema.garments)
      .where(eq(schema.garments.id, line?.garmentId ?? ''));
    expect(garment?.status).toBe('AVAILABLE');
    expect(
      (await t.gql('{ myExchangeCredits { balance { amount } } }', {}, { token: parent.accessToken })).data
        ?.myExchangeCredits,
    ).toEqual({ balance: { amount: 5_000 } });
  });

  it('lets inventory staff register and route garments, but not set customer-facing statuses', async () => {
    const inventory = await t.registerStaff('INVENTORY_MANAGER');
    const target = await variant('seed-everyday-trousers', '0-3M');
    const registered = await t.gql(
      'mutation ($id: ID!) { adminRegisterGarments(variantId: $id, quantity: 2) { id tagCode status allowedNextStatuses events { eventType actorName } } }',
      { id: target.id },
      { token: inventory.accessToken },
    );
    const garments = registered.data?.adminRegisterGarments as {
      id: string;
      tagCode: string;
      status: string;
      allowedNextStatuses: string[];
    }[];
    expect(garments).toHaveLength(2);
    expect(garments[0]).toMatchObject({
      status: 'AVAILABLE',
      allowedNextStatuses: ['RESERVED', 'RESALE', 'RETIRED'],
    });
    expect(garments[0]?.tagCode).toMatch(/^BMBG-/);

    const move =
      'mutation ($input: GarmentTransitionInput!) { adminTransitionGarment(input: $input) { status } }';
    expect(
      errorReason(
        await t.gql(
          move,
          { input: { garmentId: garments[0]?.id, status: 'WITH_CUSTOMER' } },
          { token: inventory.accessToken },
        ),
      ),
    ).toBe('STATUS_NOT_SETTABLE');
    expect(
      errorCode(
        await t.gql(
          move,
          { input: { garmentId: garments[0]?.id, status: 'RECYCLE' } },
          { token: inventory.accessToken },
        ),
      ),
    ).toBe('CONFLICT');
    expect(
      (
        await t.gql(
          move,
          { input: { garmentId: garments[0]?.id, status: 'RETIRED', note: 'Lost in storage' } },
          { token: inventory.accessToken },
        )
      ).data?.adminTransitionGarment,
    ).toEqual({ status: 'RETIRED' });

    const lookup = await t.gql(
      'query ($tag: String) { adminGarment(tagCode: $tag) { status events { eventType } } }',
      { tag: garments[0]?.tagCode },
      { token: inventory.accessToken },
    );
    expect(
      (lookup.data?.adminGarment as { events: { eventType: string }[] }).events.map(
        (event) => event.eventType,
      ),
    ).toEqual(['PROCURED', 'CHECKED_IN', 'STAFF_UPDATE']);
    const customer = await t.registerCustomer();
    expect(
      errorCode(await t.gql('{ adminGarments { totalCount } }', {}, { token: customer.accessToken })),
    ).toBe('FORBIDDEN');
  });

  it('adjusts credit by hand with an audit trail, never below zero', async () => {
    const finance = await t.registerStaff('SUPER_ADMIN');
    const parent = await t.registerCustomer();
    const adjust =
      'mutation ($id: ID!, $amount: MinorUnits!) { adminAdjustExchangeCredit(customerId: $id, amount: $amount, note: "Goodwill") { type amount { amount } } }';
    expect(
      (await t.gql(adjust, { id: parent.userId, amount: 2_000 }, { token: finance.accessToken })).data
        ?.adminAdjustExchangeCredit,
    ).toEqual({ type: 'ADJUSTMENT', amount: { amount: 2_000 } });
    expect(
      errorReason(await t.gql(adjust, { id: parent.userId, amount: -5_000 }, { token: finance.accessToken })),
    ).toBe('NEGATIVE_BALANCE');
  });
});
