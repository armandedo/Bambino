import type { ErrorContext, ErrorReporter } from '@bambino/utils';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type TestApp, createTestApp, errorCode } from '../testing/test-app';

const reports: { error: unknown; context: ErrorContext | undefined }[] = [];
const reporter: ErrorReporter = {
  report: async (error, context) => {
    reports.push({ error, context });
  },
};

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp({ catalogue: true, errorReporter: reporter });
}, 120_000);

afterAll(async () => {
  await t.close();
});

describe('error reporting', () => {
  it('reports an unexpected error with the request id only, and still masks it for the client', async () => {
    const customer = await t.registerCustomer();
    const original = t.app.services.orders.listOwn.bind(t.app.services.orders);
    t.app.services.orders.listOwn = async () => {
      throw new Error(`database exploded for ${customer.email}`);
    };
    try {
      const response = await t.gql('{ myOrders { edges { node { id } } } }', {}, { token: customer.accessToken });
      expect(errorCode(response)).toBe('INTERNAL');
      expect(JSON.stringify(response.errors)).not.toContain('exploded');
      const requestId = (response.errors?.[0]?.extensions as { requestId: string }).requestId;
      expect(reports).toHaveLength(1);
      expect(reports[0]?.context).toMatchObject({ requestId, source: 'graphql' });
    } finally {
      t.app.services.orders.listOwn = original;
    }
  });

  it('does not report expected errors such as validation or permission refusals', async () => {
    const before = reports.length;
    expect(errorCode(await t.gql('{ adminOrders { totalCount } }'))).toBe('UNAUTHENTICATED');
    expect(reports).toHaveLength(before);
  });
});

describe('readiness', () => {
  it('is ready when the database answers', async () => {
    expect(await t.app.checkReady()).toEqual({ status: 200, body: { status: 'ready', database: 'ok' } });
  });
});
