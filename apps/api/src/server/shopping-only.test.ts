import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, errorCode, errorReason, type TestApp } from '../testing/test-app';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp({ catalogue: true, subscriptionsEnabled: false });
}, 120_000);
afterAll(async () => {
  await t.close();
});

describe('shopping-only API', () => {
  it('does not offer plans, but still serves the shopping catalogue', async () => {
    const response = await t.gql(
      '{ subscriptionPlans { id } products(filter: { oneTimeEligible: true }, first: 2) { edges { node { id oneTimeEligible } } } }',
    );
    expect(response.errors).toBeUndefined();
    expect(response.data?.subscriptionPlans).toEqual([]);
    const catalogue = response.data?.products as { edges: { node: { oneTimeEligible: boolean } }[] };
    expect(catalogue.edges.length).toBeGreaterThan(0);
    expect(catalogue.edges.every(({ node }) => node.oneTimeEligible)).toBe(true);
  });
  it('rejects new subscriptions and reactivation through direct API calls', async () => {
    const user = await t.registerCustomer();
    const id = randomUUID();
    const create = await t.gql(
      'mutation ($input: CreateSubscriptionInput!) { createSubscription(input: $input) { id } }',
      {
        input: {
          idempotencyKey: randomUUID(),
          planId: id,
          babyProfileId: id,
          shippingAddressId: id,
          deliveryOptionCode: 'standard',
        },
      },
      { token: user.accessToken },
    );
    expect(errorCode(create)).toBe('FORBIDDEN');
    expect(errorReason(create)).toBe('SUBSCRIPTIONS_DISABLED');
    for (const mutation of [
      'mutation ($id: ID!) { resumeSubscription(id: $id) { id } }',
      'mutation ($id: ID!) { changeSubscriptionPlan(id: $id, planId: $id) { id } }',
      'mutation ($id: ID!) { selectSubscriptionItems(id: $id, variantIds: []) { id } }',
    ]) {
      const result = await t.gql(mutation, { id }, { token: user.accessToken });
      expect(errorReason(result)).toBe('SUBSCRIPTIONS_DISABLED');
    }
  });
  it('skips renewal processing before reading any subscriptions or requesting payment', async () => {
    const select = vi.spyOn(t.db, 'select');
    expect(await t.app.services.subscriptions.runRenewals()).toEqual({
      renewalsCreated: 0,
      expired: 0,
      cancelled: 0,
      resumed: 0,
      reminded: 0,
    });
    expect(select).not.toHaveBeenCalled();
    select.mockRestore();
  });
});
