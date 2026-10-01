import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ME, PASSWORD, type TestApp, createTestApp, errorCode, errorReason } from '../testing/test-app';

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
}, 60_000);

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

const CREATE_ADDRESS =
  'mutation ($input: AddressInput!) { createAddress(input: $input) { id isDefault district } }';
const UPDATE_ADDRESS =
  'mutation ($id: ID!, $input: AddressInput!) { updateAddress(id: $id, input: $input) { id isDefault district } }';
const DELETE_ADDRESS = 'mutation ($id: ID!) { deleteAddress(id: $id) }';

describe('profile', () => {
  it('updates names and phone, and refuses a phone used by another account', async () => {
    const a = await t.registerCustomer();
    const b = await t.registerCustomer();
    const update =
      'mutation ($input: UpdateProfileInput!) { updateProfile(input: $input) { firstName phone } }';
    const ok = await t.gql(
      update,
      { input: { firstName: 'Aline', phone: '+250 788 000 111' } },
      { token: a.accessToken },
    );
    expect(ok.data?.updateProfile).toEqual({ firstName: 'Aline', phone: '+250788000111' });
    const clash = await t.gql(update, { input: { phone: '+250788000111' } }, { token: b.accessToken });
    expect(errorReason(clash)).toBe('PHONE_IN_USE');
  });
});

describe('addresses', () => {
  it('makes the first address the default and moves the default when asked', async () => {
    const { accessToken } = await t.registerCustomer();
    const first = (await t.gql(CREATE_ADDRESS, { input: kigali }, { token: accessToken })).data
      ?.createAddress as { id: string; isDefault: boolean };
    expect(first.isDefault).toBe(true);
    const second = (
      await t.gql(
        CREATE_ADDRESS,
        { input: { ...kigali, district: 'Kicukiro', isDefault: true } },
        { token: accessToken },
      )
    ).data?.createAddress as { id: string; isDefault: boolean };
    expect(second.isDefault).toBe(true);
    const me = (await t.gql(ME, {}, { token: accessToken })).data?.me as {
      addresses: { id: string; isDefault: boolean }[];
    };
    expect(me.addresses).toEqual([
      { id: second.id, isDefault: true },
      { id: first.id, isDefault: false },
    ]);

    // Deleting the default promotes the remaining address.
    expect((await t.gql(DELETE_ADDRESS, { id: second.id }, { token: accessToken })).data?.deleteAddress).toBe(
      true,
    );
    const after = (await t.gql(ME, {}, { token: accessToken })).data?.me as {
      addresses: { id: string; isDefault: boolean }[];
    };
    expect(after.addresses).toEqual([{ id: first.id, isDefault: true }]);
  });

  it('applies the Rwanda address format', async () => {
    const { accessToken } = await t.registerCustomer();
    const response = await t.gql(
      CREATE_ADDRESS,
      { input: { ...kigali, sector: null } },
      { token: accessToken },
    );
    expect(errorCode(response)).toBe('VALIDATION_FAILED');
  });

  it("treats another customer's address as not found", async () => {
    const owner = await t.registerCustomer();
    const intruder = await t.registerCustomer();
    const address = (await t.gql(CREATE_ADDRESS, { input: kigali }, { token: owner.accessToken })).data
      ?.createAddress as { id: string };
    expect(
      errorCode(
        await t.gql(UPDATE_ADDRESS, { id: address.id, input: kigali }, { token: intruder.accessToken }),
      ),
    ).toBe('NOT_FOUND');
    expect(errorCode(await t.gql(DELETE_ADDRESS, { id: address.id }, { token: intruder.accessToken }))).toBe(
      'NOT_FOUND',
    );
    expect(
      errorCode(await t.gql(DELETE_ADDRESS, { id: 'not-a-uuid' }, { token: intruder.accessToken })),
    ).toBe('NOT_FOUND');
  });
});

describe('data requests', () => {
  it('records one open export request and requires the password for deletion', async () => {
    const { accessToken } = await t.registerCustomer();
    const exportRequest = 'mutation { requestDataExport { id type status } }';
    const first = (await t.gql(exportRequest, {}, { token: accessToken })).data?.requestDataExport as {
      id: string;
    };
    const second = (await t.gql(exportRequest, {}, { token: accessToken })).data?.requestDataExport as {
      id: string;
    };
    expect(second.id).toBe(first.id);

    const deletion =
      'mutation ($password: String!) { requestAccountDeletion(currentPassword: $password) { type status } }';
    expect(errorReason(await t.gql(deletion, { password: 'wrong-password' }, { token: accessToken }))).toBe(
      'CURRENT_PASSWORD_INCORRECT',
    );
    expect(
      (await t.gql(deletion, { password: PASSWORD }, { token: accessToken })).data?.requestAccountDeletion,
    ).toEqual({
      type: 'DELETION',
      status: 'REQUESTED',
    });
    const list = (await t.gql('{ myDataRequests { type } }', {}, { token: accessToken })).data
      ?.myDataRequests as unknown[];
    expect(list).toHaveLength(2);
  });
});

describe('staff authorization', () => {
  const ROLES = '{ adminRoles { key permissions } }';
  const ASSIGN =
    'mutation ($userId: ID!, $role: String!) { adminAssignRole(userId: $userId, roleKey: $role) { id roles { key } } }';

  it('rejects anonymous callers and customers before any service code runs', async () => {
    const customer = await t.registerCustomer();
    expect(errorCode(await t.gql(ROLES))).toBe('UNAUTHENTICATED');
    expect(errorCode(await t.gql(ROLES, {}, { token: customer.accessToken }))).toBe('FORBIDDEN');
    expect(errorReason(await t.gql(ROLES, {}, { token: customer.accessToken }))).toBe('user_role:read');
  });

  it('lets a super admin grant a role, which takes effect on the next request with the same token', async () => {
    const admin = await t.registerStaff('SUPER_ADMIN');
    const customer = await t.registerCustomer();
    const roles = (await t.gql(ROLES, {}, { token: admin.accessToken })).data?.adminRoles as {
      key: string;
    }[];
    expect(roles.map((role) => role.key)).toContain('FINANCE');

    const granted = await t.gql(
      ASSIGN,
      { userId: customer.userId, role: 'FINANCE' },
      { token: admin.accessToken },
    );
    expect(granted.data?.adminAssignRole).toMatchObject({
      roles: expect.arrayContaining([{ key: 'FINANCE' }]),
    });
    const me = (await t.gql(ME, {}, { token: customer.accessToken })).data?.me as { permissions: string[] };
    expect(me.permissions).toContain('payment:write');

    const log = await t.gql(
      'query ($id: String) { adminAuditLogs(entityId: $id) { items { action actorName newValue } pageInfo { hasNextPage } } }',
      { id: customer.userId },
      { token: admin.accessToken },
    );
    expect(log.data?.adminAuditLogs).toEqual({
      items: [{ action: 'user_role.assigned', actorName: 'Seed Parent', newValue: '{"roleKey":"FINANCE"}' }],
      pageInfo: { hasNextPage: false },
    });
  });

  it('forbids changing your own roles and holding a role does not grant unrelated permissions', async () => {
    const admin = await t.registerStaff('SUPER_ADMIN');
    expect(
      errorReason(
        await t.gql(ASSIGN, { userId: admin.userId, role: 'FINANCE' }, { token: admin.accessToken }),
      ),
    ).toBe('SELF_ROLE_CHANGE');
    const support = await t.registerStaff('CUSTOMER_SUPPORT');
    expect(errorCode(await t.gql(ROLES, {}, { token: support.accessToken }))).toBe('FORBIDDEN');
  });

  it('paginates the audit log with an opaque cursor', async () => {
    const admin = await t.registerStaff('SUPER_ADMIN');
    for (let index = 0; index < 3; index++) {
      const customer = await t.registerCustomer();
      await t.gql(ASSIGN, { userId: customer.userId, role: 'DELIVERY_STAFF' }, { token: admin.accessToken });
    }
    const page =
      'query ($after: String) { adminAuditLogs(page: { first: 2, after: $after }) { items { entityId } pageInfo { endCursor hasNextPage } } }';
    const first = (await t.gql(page, {}, { token: admin.accessToken })).data?.adminAuditLogs as {
      items: { entityId: string }[];
      pageInfo: { endCursor: string; hasNextPage: boolean };
    };
    expect(first.items).toHaveLength(2);
    expect(first.pageInfo.hasNextPage).toBe(true);
    const second = (await t.gql(page, { after: first.pageInfo.endCursor }, { token: admin.accessToken })).data
      ?.adminAuditLogs as {
      items: { entityId: string }[];
    };
    expect(second.items.map((item) => item.entityId)).not.toContain(first.items[0]?.entityId);
    expect(errorReason(await t.gql(page, { after: 'garbage' }, { token: admin.accessToken }))).toBe(
      'INVALID_CURSOR',
    );
  });
});

describe('API hardening', () => {
  it('has a resolver for every operation in the contract (none answers NOT_IMPLEMENTED)', async () => {
    const admin = await t.registerStaff('SUPER_ADMIN');
    const response = await t.gql('{ adminCustomers { totalCount } }', {}, { token: admin.accessToken });
    expect(response.errors).toBeUndefined();
    expect(t.app.coverage.implemented).toEqual(
      expect.arrayContaining([
        'register',
        'login',
        'me',
        'adminRoles',
        'createSubscription',
        'requestReturn',
      ]),
    );
    expect(t.app.coverage.notImplemented).toEqual([]);
  });

  it('enforces guards on admin operations', async () => {
    expect(errorCode(await t.gql('{ adminCustomers { totalCount } }'))).toBe('UNAUTHENTICATED');
  });

  it('rejects documents that are too deep or use too many aliases', async () => {
    const limited = await createTestApp({ queryLimits: { maxDepth: 3, maxFields: 400, maxAliases: 2 } });
    try {
      const deep = await limited.gql(
        '{ market { addressFormat { key } paymentProviders } me { addresses { id } } }',
      );
      expect(deep.errors).toBeUndefined();
      const tooDeep = await limited.gql(
        '{ me { addresses { id } } __schema { types { fields { type { name } } } } }',
      );
      expect(tooDeep.errors?.[0]?.message).toMatch(/nested too deeply/);
      const aliases = await limited.gql('{ a: market { code } b: market { code } c: market { code } }');
      expect(aliases.errors?.[0]?.message).toMatch(/too many aliases/);
    } finally {
      await limited.close();
    }
  }, 60_000);

  it('serves the Rwanda market configuration publicly', async () => {
    const response = await t.gql(
      '{ market { code currency timezone paymentProviders addressFormat { key required } } }',
    );
    expect(response.data?.market).toMatchObject({
      code: 'RW',
      currency: 'RWF',
      timezone: 'Africa/Kigali',
      paymentProviders: ['MTN_MOMO', 'AIRTEL_MONEY'],
    });
  });

  it('sets security headers and a request id that matches the one in errors', async () => {
    const response = await t.gql('{ adminRoles { key } }');
    const requestId = response.headers.get('x-request-id');
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.errors?.[0]?.extensions?.requestId).toBe(requestId);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
  });

  it('allows CORS only from the configured web and admin origins', async () => {
    const preflight = (origin: string) =>
      t.app.yoga.fetch('http://api.test/graphql', {
        method: 'OPTIONS',
        headers: {
          origin,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type,x-bambino-client',
        },
      });
    expect((await preflight('http://web.test')).headers.get('access-control-allow-origin')).toBe(
      'http://web.test',
    );
    expect((await preflight('http://admin.test')).headers.get('access-control-allow-credentials')).toBe(
      'true',
    );
    expect((await preflight('https://evil.example')).headers.get('access-control-allow-origin')).not.toBe(
      'https://evil.example',
    );
  });

  it('serves a health check over a real HTTP listener', async () => {
    const server = createServer(t.app.handler);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const { port } = server.address() as AddressInfo;
      const health = await fetch(`http://127.0.0.1:${port}/health`);
      expect(await health.json()).toEqual({ status: 'ok' });
      const graphql = await fetch(`http://127.0.0.1:${port}/graphql`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: '{ market { code } }' }),
      });
      expect(await graphql.json()).toEqual({ data: { market: { code: 'RW' } } });

      const webhook = (path: string, body: string) =>
        fetch(`http://127.0.0.1:${port}${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
        });
      expect((await webhook('/webhooks/payments/mock', 'not json')).status).toBe(400);
      expect(
        (await webhook('/webhooks/payments/mock', JSON.stringify({ eventId: 'e1', reference: 'r1' }))).status,
      ).toBe(401);
      expect((await webhook('/webhooks/payments/unknown', '{}')).status).toBe(404);
      expect((await webhook('/webhooks/payments/mock', 'x'.repeat(70_000))).status).toBe(413);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
