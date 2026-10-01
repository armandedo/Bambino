import { randomUUID } from 'node:crypto';
import { schema } from '@bambino/database';
import { and, eq } from '@bambino/database/orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MOCK_WALLETS } from '../providers/payments';
import { LOGIN, PASSWORD, type TestApp, createTestApp, errorCode, errorReason } from '../testing/test-app';

/** Renewal tests move the clock forward by weeks, so they have their own app and database. */
let t: TestApp;

beforeAll(async () => {
  t = await createTestApp({ catalogue: true });
}, 120_000);

afterAll(async () => {
  await t.close();
});

const DAY = 86_400_000;
const kigali = {
  recipientName: 'Aline Uwase',
  phone: '+250788123456',
  countryCode: 'RW',
  region: 'Kigali',
  district: 'Gasabo',
  sector: 'Kimironko',
};
const SUBSCRIPTION = `query ($id: ID!) { subscription(id: $id) { id status currentPeriodStart currentPeriodEnd nextBillingAt cancelAtPeriodEnd
  pausedAt plan { code } pendingPlan { code } canPause canResume canCancel history { type status } orderAwaitingPayment { id totals { total { amount } } } } }`;

interface Subscriber {
  email: string;
  token: string;
  subscriptionId: string;
}

async function planId(code: string) {
  const plans = (await t.gql('{ subscriptionPlans { id code } }')).data?.subscriptionPlans as {
    id: string;
    code: string;
  }[];
  const plan = plans.find((candidate) => candidate.code === code);
  if (!plan) throw new Error(`plan ${code} missing`);
  return plan.id;
}

/** Tokens expire as the clock moves; sign in again for a fresh one. */
async function freshToken(email: string): Promise<string> {
  return (
    (await t.gql(LOGIN, { input: { email, password: PASSWORD } })).data?.login as { accessToken: string }
  ).accessToken;
}

async function getSubscription(subscriber: Subscriber) {
  subscriber.token = await freshToken(subscriber.email);
  return (await t.gql(SUBSCRIPTION, { id: subscriber.subscriptionId }, { token: subscriber.token })).data
    ?.subscription as Record<string, unknown> & {
    status: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    history: { type: string; status: string }[];
    orderAwaitingPayment: { id: string; totals: { total: { amount: number } } } | null;
  };
}

async function pay(subscriber: Subscriber, orderId: string, msisdn: string = MOCK_WALLETS.approves) {
  const payment = (
    await t.gql(
      'mutation ($input: InitiatePaymentInput!) { initiatePayment(input: $input) { id } }',
      { input: { idempotencyKey: randomUUID(), orderId, provider: 'MOCK', msisdn } },
      { token: subscriber.token },
    )
  ).data?.initiatePayment as { id: string };
  return t.gql(
    'query ($id: ID!) { payment(id: $id) { status } }',
    { id: payment.id },
    { token: subscriber.token },
  );
}

/** A customer with an ACTIVE monthly subscription, paid at the current clock time. */
async function activeSubscriber(
  options: { paymentMethod?: boolean; plan?: string } = {},
): Promise<Subscriber> {
  const account = await t.registerCustomer();
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
  let paymentMethodId: string | null = null;
  if (options.paymentMethod) {
    paymentMethodId = (
      (
        await t.gql(
          `mutation { addPaymentMethod(input: { provider: MOCK, msisdn: "${MOCK_WALLETS.approves}", isDefault: true }) { id } }`,
          {},
          { token },
        )
      ).data?.addPaymentMethod as { id: string }
    ).id;
  }
  const subscription = (
    await t.gql(
      'mutation ($input: CreateSubscriptionInput!) { createSubscription(input: $input) { id orderAwaitingPayment { id } } }',
      {
        input: {
          idempotencyKey: randomUUID(),
          planId: await planId(options.plan ?? 'SEED-MONTHLY'),
          babyProfileId: baby.id,
          shippingAddressId: address.id,
          deliveryOptionCode: 'SEED-STANDARD',
          paymentMethodId,
        },
      },
      { token },
    )
  ).data?.createSubscription as { id: string; orderAwaitingPayment: { id: string } };
  const subscriber = { email: account.email, token, subscriptionId: subscription.id };
  await pay(subscriber, subscription.orderAwaitingPayment.id);
  return subscriber;
}

describe('subscription lifecycle', () => {
  it('pauses and resumes, adding the paused time to the period', async () => {
    const subscriber = await activeSubscriber();
    const before = await getSubscription(subscriber);
    const paused = await t.gql(
      'mutation ($id: ID!) { pauseSubscription(id: $id) { status canPause canResume } }',
      { id: subscriber.subscriptionId },
      { token: subscriber.token },
    );
    expect(paused.data?.pauseSubscription).toEqual({ status: 'PAUSED', canPause: false, canResume: true });

    t.advanceClock(10 * DAY);
    subscriber.token = await freshToken(subscriber.email);
    await t.gql(
      'mutation ($id: ID!) { resumeSubscription(id: $id) { status } }',
      { id: subscriber.subscriptionId },
      { token: subscriber.token },
    );
    const after = await getSubscription(subscriber);
    expect(after.status).toBe('ACTIVE');
    expect(Date.parse(after.currentPeriodEnd) - Date.parse(before.currentPeriodEnd)).toBe(10 * DAY);
    expect(after.history.map((event) => event.type)).toEqual(['CREATED', 'ACTIVATED', 'PAUSED', 'RESUMED']);
  });

  it("refuses pauses longer than the policy allows and actions on another customer's subscription", async () => {
    const subscriber = await activeSubscriber();
    const tooLong = new Date(Date.parse('2026-10-01T08:00:00Z') + 400 * DAY).toISOString();
    expect(
      errorReason(
        await t.gql(
          'mutation ($id: ID!, $at: DateTime) { pauseSubscription(id: $id, resumeAt: $at) { status } }',
          { id: subscriber.subscriptionId, at: tooLong },
          { token: subscriber.token },
        ),
      ),
    ).toBe('INVALID_RESUME_DATE');
    const stranger = await t.registerCustomer();
    expect(
      errorCode(
        await t.gql(
          'mutation ($id: ID!) { pauseSubscription(id: $id) { status } }',
          { id: subscriber.subscriptionId },
          { token: stranger.accessToken },
        ),
      ),
    ).toBe('NOT_FOUND');
  });

  it('cancels at the end of the paid period by default', async () => {
    const subscriber = await activeSubscriber();
    const cancelled = await t.gql(
      'mutation ($id: ID!) { cancelSubscription(id: $id, reason: "Moving abroad") { status cancelAtPeriodEnd canCancel } }',
      { id: subscriber.subscriptionId },
      { token: subscriber.token },
    );
    expect(cancelled.data?.cancelSubscription).toEqual({
      status: 'ACTIVE',
      cancelAtPeriodEnd: true,
      canCancel: false,
    });

    t.advanceClock(32 * DAY);
    await t.app.runJobs();
    const ended = await getSubscription(subscriber);
    expect(ended).toMatchObject({ status: 'CANCELLED', orderAwaitingPayment: null });
    expect(ended.history.map((event) => event.type)).toEqual([
      'CREATED',
      'ACTIVATED',
      'CANCELLATION_SCHEDULED',
      'CANCELLED',
    ]);
  });

  it('renews: the renewal falls due, the customer pays, and a new period starts', async () => {
    const subscriber = await activeSubscriber();
    const first = await getSubscription(subscriber);

    t.advanceClock(32 * DAY);
    await t.app.runJobs();
    const due = await getSubscription(subscriber);
    expect(due.status).toBe('PAST_DUE');
    expect(due.orderAwaitingPayment?.totals.total.amount).toBe(41_000);

    expect((await pay(subscriber, due.orderAwaitingPayment?.id ?? '')).data?.payment).toEqual({
      status: 'SUCCEEDED',
    });
    const renewed = await getSubscription(subscriber);
    expect(renewed.status).toBe('ACTIVE');
    expect(renewed.currentPeriodStart).toBe(first.currentPeriodEnd);
    expect(renewed.history.map((event) => event.type)).toEqual([
      'CREATED',
      'ACTIVATED',
      'RENEWAL_DUE',
      'RENEWED',
    ]);
  });

  it('expires after the grace period when a renewal is never paid', async () => {
    const subscriber = await activeSubscriber();
    t.advanceClock(32 * DAY);
    await t.app.runJobs();
    const due = await getSubscription(subscriber);
    const renewalOrderId = due.orderAwaitingPayment?.id ?? '';

    t.advanceClock(8 * DAY);
    await t.app.runJobs();
    const expired = await getSubscription(subscriber);
    expect(expired).toMatchObject({ status: 'EXPIRED', canCancel: false });
    const [order] = await t.db.select().from(schema.orders).where(eq(schema.orders.id, renewalOrderId));
    expect(order?.status).toBe('CANCELLED');
  });

  it('applies a plan change at the next renewal', async () => {
    const subscriber = await activeSubscriber();
    const changed = await t.gql(
      'mutation ($id: ID!, $plan: ID!) { changeSubscriptionPlan(id: $id, planId: $plan) { plan { code } pendingPlan { code } } }',
      { id: subscriber.subscriptionId, plan: await planId('SEED-QUARTERLY') },
      { token: subscriber.token },
    );
    expect(changed.data?.changeSubscriptionPlan).toEqual({
      plan: { code: 'SEED-MONTHLY' },
      pendingPlan: { code: 'SEED-QUARTERLY' },
    });

    t.advanceClock(32 * DAY);
    await t.app.runJobs();
    const due = await getSubscription(subscriber);
    // The renewal is priced on the new plan: 108,000 + 2,000 delivery.
    expect(due.orderAwaitingPayment?.totals.total.amount).toBe(110_000);
    await pay(subscriber, due.orderAwaitingPayment?.id ?? '');
    const renewed = await getSubscription(subscriber);
    expect(renewed).toMatchObject({ status: 'ACTIVE', plan: { code: 'SEED-QUARTERLY' }, pendingPlan: null });
    // A quarterly period is three months.
    expect(
      new Date(renewed.currentPeriodEnd).getUTCMonth() - new Date(renewed.currentPeriodStart).getUTCMonth(),
    ).toBe(3);
  });

  it('asks a saved wallet for the renewal automatically', async () => {
    const subscriber = await activeSubscriber({ paymentMethod: true });
    t.advanceClock(32 * DAY);
    await t.app.runJobs();
    const due = await getSubscription(subscriber);
    expect(due.status).toBe('PAST_DUE');
    const [payment] = await t.db
      .select()
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.orderId, due.orderAwaitingPayment?.id ?? ''),
          eq(schema.payments.status, 'PENDING'),
        ),
      );
    expect(payment).toBeDefined();

    // The customer approves on their phone; the next reconciliation picks it up.
    t.advanceClock(3 * 60_000);
    await t.app.runJobs();
    expect((await getSubscription(subscriber)).status).toBe('ACTIVE');
  });

  it('sends one renewal reminder in the days before renewal', async () => {
    const subscriber = await activeSubscriber();
    t.advanceClock(28 * DAY);
    await t.app.runJobs();
    await t.app.runJobs();
    subscriber.token = await freshToken(subscriber.email);
    const notifications = (
      await t.gql('{ myNotifications { edges { node { type } } } }', {}, { token: subscriber.token })
    ).data?.myNotifications as {
      edges: { node: { type: string } }[];
    };
    expect(
      notifications.edges.filter((edge) => edge.node.type === 'SUBSCRIPTION_RENEWAL_REMINDER'),
    ).toHaveLength(1);
  });

  it('expires a subscription whose first payment never arrives', async () => {
    const account = await t.registerCustomer();
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
    const subscription = (
      await t.gql(
        'mutation ($input: CreateSubscriptionInput!) { createSubscription(input: $input) { id } }',
        {
          input: {
            idempotencyKey: randomUUID(),
            planId: await planId('SEED-MONTHLY'),
            babyProfileId: baby.id,
            shippingAddressId: address.id,
            deliveryOptionCode: 'SEED-STANDARD',
          },
        },
        { token },
      )
    ).data?.createSubscription as { id: string };
    t.advanceClock(25 * 3_600_000);
    await t.app.runJobs();
    expect(
      (await getSubscription({ email: account.email, token, subscriptionId: subscription.id })).status,
    ).toBe('EXPIRED');
  });
});

describe('plan administration', () => {
  it('lets plan editors configure plans, audited, and keeps others out', async () => {
    const admin = await t.registerStaff('SUPER_ADMIN');
    const support = await t.registerStaff('CUSTOMER_SUPPORT');
    const categories = (await t.gql('{ categories { id slug } }')).data?.categories as {
      id: string;
      slug: string;
    }[];
    const input = {
      code: 'TEST-SLEEP',
      name: 'Sleep plan (test)',
      description: 'Test plan',
      billingInterval: 'MONTHLY',
      priceAmount: 25_000,
      itemsPerCycle: 3,
      allowedCategoryIds: categories
        .filter((category) => category.slug === 'sleepwear')
        .map((category) => category.id),
      isActive: true,
    };
    const upsert =
      'mutation ($input: SubscriptionPlanInput!) { adminUpsertSubscriptionPlan(input: $input) { code price { amount } allowedCategories { slug } } }';
    expect(
      (await t.gql(upsert, { input }, { token: admin.accessToken })).data?.adminUpsertSubscriptionPlan,
    ).toEqual({
      code: 'TEST-SLEEP',
      price: { amount: 25_000 },
      allowedCategories: [{ slug: 'sleepwear' }],
    });
    expect(errorCode(await t.gql(upsert, { input }, { token: support.accessToken }))).toBe('FORBIDDEN');
    const audit = await t.db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.action, 'plan.created'));
    expect(audit).toHaveLength(1);
  });
});
