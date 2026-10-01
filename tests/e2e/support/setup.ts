import { expect, request } from '@playwright/test';
import type { staffApi } from './api';
import { TEST_PASSWORD, testEmail } from './api';

type Gql = <T>(query: string, variables?: object) => Promise<T>;
type Staff = Awaited<ReturnType<typeof staffApi>>;

const GRAPHQL_URL = `${process.env.E2E_API_URL ?? 'http://localhost:4000'}/graphql`;

function birthDate(monthsAgo: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() - monthsAgo);
  return date.toISOString().slice(0, 10);
}

/** A customer created through the API (mobile client, bearer token), for journeys that start with staff. */
export async function apiCustomer(label: string) {
  const context = await request.newContext();
  const consents = ['TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'CHILD_DATA_PROCESSING'].map((type) => ({
    type,
    documentVersion: 'draft-1',
    granted: true,
  }));
  const response = await context.post(GRAPHQL_URL, {
    data: {
      query:
        'mutation ($input: RegisterInput!) { register(input: $input) { accessToken user { id firstName lastName } } }',
      variables: {
        input: {
          email: testEmail(label),
          password: TEST_PASSWORD,
          firstName: 'Mukamana',
          lastName: 'Grace',
          consents,
        },
      },
    },
  });
  const body = (await response.json()) as { data?: { register: { accessToken: string } }; errors?: unknown };
  if (!body.data) throw new Error(`registration failed: ${JSON.stringify(body.errors)}`);
  const token = body.data.register.accessToken;
  const gql: Gql = async <T>(query: string, variables: object = {}) => {
    const r = await context.post(GRAPHQL_URL, {
      headers: { authorization: `Bearer ${token}` },
      data: { query, variables },
    });
    const b = (await r.json()) as { data?: T; errors?: unknown };
    if (!b.data) throw new Error(`GraphQL error: ${JSON.stringify(b.errors)}`);
    return b.data;
  };
  return { gql, dispose: () => context.dispose() };
}

/**
 * An ACTIVE subscription whose first delivery (two tagged garments in 3-6M) has arrived. Staff steps go through
 * the API; journeys test the steps that matter to them in the UI.
 */
export async function subscriberWithDeliveredGarments(gql: Gql, staff: Staff) {
  await staff.stockGarments(['3-6M', '6-9M']);
  const address = await gql<{ createAddress: { id: string } }>(
    'mutation ($input: AddressInput!) { createAddress(input: $input) { id } }',
    {
      input: {
        recipientName: 'Aline Uwase',
        phone: '+250788123456',
        countryCode: 'RW',
        region: 'Kigali City',
        district: 'Gasabo',
        sector: 'Kimihurura',
        isDefault: true,
      },
    },
  );
  const baby = await gql<{ createBabyProfile: { id: string } }>(
    'mutation ($input: CreateBabyProfileInput!) { createBabyProfile(input: $input) { id } }',
    {
      input: { nickname: 'Ganza', dateOfBirth: birthDate(4), measurement: { heightMm: 640, weightG: 7000 } },
    },
  );
  const reference = await gql<{
    subscriptionPlans: { id: string }[];
    deliveryOptions: { code: string }[];
    products: {
      edges: {
        node: { variants: { id: string; availableForSubscription: boolean; size: { code: string } }[] };
      }[];
    };
  }>(
    `{ subscriptionPlans { id } deliveryOptions { code }
       products(filter: { subscriptionEligible: true }, first: 10) { edges { node { variants { id availableForSubscription size { code } } } } } }`,
  );
  const variants = reference.products.edges
    .map((edge) => edge.node.variants.find((v) => v.size.code === '3-6M' && v.availableForSubscription))
    .filter((v): v is NonNullable<typeof v> => v !== undefined)
    .slice(0, 2);
  expect(variants).toHaveLength(2);

  const created = await gql<{ createSubscription: { id: string } }>(
    'mutation ($input: CreateSubscriptionInput!) { createSubscription(input: $input) { id } }',
    {
      input: {
        idempotencyKey: crypto.randomUUID(),
        planId: reference.subscriptionPlans[0]?.id,
        babyProfileId: baby.createBabyProfile.id,
        shippingAddressId: address.createAddress.id,
        deliveryOptionCode: reference.deliveryOptions[0]?.code,
      },
    },
  );
  const selected = await gql<{ selectSubscriptionItems: { orderAwaitingPayment: { id: string } } }>(
    'mutation ($id: ID!, $ids: [ID!]!) { selectSubscriptionItems(id: $id, variantIds: $ids) { orderAwaitingPayment { id } } }',
    { id: created.createSubscription.id, ids: variants.map((v) => v.id) },
  );
  const orderId = selected.selectSubscriptionItems.orderAwaitingPayment.id;
  const payment = await gql<{ initiatePayment: { id: string } }>(
    'mutation ($input: InitiatePaymentInput!) { initiatePayment(input: $input) { id } }',
    { input: { idempotencyKey: crypto.randomUUID(), orderId, provider: 'MOCK', msisdn: '+250780000001' } },
  );
  await expect
    .poll(
      async () =>
        (
          await gql<{ payment: { status: string } }>('query ($id: ID!) { payment(id: $id) { status } }', {
            id: payment.initiatePayment.id,
          })
        ).payment.status,
      { timeout: 30_000, intervals: [2000] },
    )
    .toBe('SUCCEEDED');

  await staff.advanceOrder(orderId, ['PROCESSING', 'PACKED', 'READY_FOR_DISPATCH']);
  const order = await gql<{ order: { delivery: { id: string } } }>(
    'query ($id: ID!) { order(id: $id) { delivery { id } } }',
    { id: orderId },
  );
  await staff.advanceDelivery(order.order.delivery.id, ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED']);
  const held = await gql<{ myGarments: { id: string; tagCode: string }[] }>('{ myGarments { id tagCode } }');
  expect(held.myGarments).toHaveLength(2);
  return { garments: held.myGarments, addressId: address.createAddress.id };
}
