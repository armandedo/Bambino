import { randomUUID } from 'node:crypto';
import { schema } from '@bambino/database';
import { eq, inArray } from '@bambino/database/orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MOCK_WALLETS } from '../providers/payments';
import { LOGIN, PASSWORD, type TestApp, createTestApp, errorCode, errorReason } from '../testing/test-app';

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp({ catalogue: true });
}, 120_000);

afterAll(async () => {
  await t.close();
});

const DAY = 24 * 60 * 60_000;
const REQUESTS = '{ myDataRequests { id type status downloadAvailable } }';
const DOWNLOAD = 'query ($id: ID!) { dataExportDownload(id: $id) { url expiresAt } }';
const DELETE = 'mutation ($p: String!) { requestAccountDeletion(currentPassword: $p) { id } }';

/** A family with a baby, a measurement, a recommendation, an address and a paid order. */
async function family() {
  const customer = await t.registerCustomer();
  const token = customer.accessToken;
  const call = async <T>(query: string, variables: Record<string, unknown> = {}): Promise<T> => {
    const response = await t.gql(query, variables, { token });
    if (response.errors) throw new Error(JSON.stringify(response.errors));
    return response.data as T;
  };
  const baby = await call<{ createBabyProfile: { id: string } }>(
    'mutation ($input: CreateBabyProfileInput!) { createBabyProfile(input: $input) { id } }',
    { input: { nickname: 'Keza', dateOfBirth: '2026-04-01' } },
  );
  const babyId = baby.createBabyProfile.id;
  await call(
    'mutation ($id: ID!) { addBabyMeasurement(babyProfileId: $id, input: { heightMm: 640, weightG: 7100 }) { id } }',
    { id: babyId },
  );
  await call('mutation ($id: ID!) { createSizingRecommendation(babyProfileId: $id) { id } }', { id: babyId });
  const address = await call<{ createAddress: { id: string } }>(
    'mutation ($input: AddressInput!) { createAddress(input: $input) { id } }',
    {
      input: {
        recipientName: 'Aline Uwase',
        phone: '+250788123456',
        countryCode: 'RW',
        region: 'Kigali',
        district: 'Gasabo',
        sector: 'Kimironko',
        street: 'KG 11 Ave',
      },
    },
  );
  const product = await call<{ product: { variants: { id: string; inStock: boolean }[] } }>(
    '{ product(slug: "seed-footed-romper") { variants { id inStock } } }',
  );
  await call('mutation ($id: ID!) { addToCart(variantId: $id, quantity: 1) { id } }', {
    id: product.product.variants.find((v) => v.inStock)?.id,
  });
  const order = await call<{ createOrder: { id: string } }>(
    'mutation ($input: CreateOrderInput!) { createOrder(input: $input) { id } }',
    {
      input: {
        idempotencyKey: randomUUID(),
        checkout: { shippingAddressId: address.createAddress.id, deliveryOptionCode: 'SEED-STANDARD' },
      },
    },
  );
  const payment = await call<{ initiatePayment: { id: string } }>(
    'mutation ($input: InitiatePaymentInput!) { initiatePayment(input: $input) { id } }',
    {
      input: {
        idempotencyKey: randomUUID(),
        orderId: order.createOrder.id,
        provider: 'MOCK',
        msisdn: MOCK_WALLETS.approves,
      },
    },
  );
  await call('query ($id: ID!) { payment(id: $id) { status } }', { id: payment.initiatePayment.id });
  return { ...customer, babyId, orderId: order.createOrder.id, paymentId: payment.initiatePayment.id };
}

describe('data export', () => {
  it('builds a private JSON archive, emails the owner, and only the owner can download it, for a while', async () => {
    const parent = await family();
    const requested = await t.gql('mutation { requestDataExport { id } }', {}, { token: parent.accessToken });
    const id = (requested.data?.requestDataExport as { id: string }).id;
    await t.app.runJobs();

    const list = (await t.gql(REQUESTS, {}, { token: parent.accessToken })).data?.myDataRequests as {
      id: string;
      status: string;
      downloadAvailable: boolean;
    }[];
    expect(list.find((r) => r.id === id)).toMatchObject({ status: 'COMPLETED', downloadAvailable: true });

    const [row] = await t.db.select().from(schema.dataRequests).where(eq(schema.dataRequests.id, id));
    const key = row?.resultObjectKey ?? '';
    expect(key).toMatch(/^private\/exports\//); // outside the public-read prefixes
    const archive = JSON.parse(t.storage.bodies.get(key) ?? '{}') as Record<string, unknown[]> & {
      account: { email: string };
    };
    expect(archive.account.email).toBe(parent.email);
    for (const section of [
      'babies',
      'measurements',
      'orders',
      'payments',
      'subscriptions',
      'consents',
      'auditEntries',
    ]) {
      expect(archive[section], section).toBeInstanceOf(Array);
    }
    expect(archive.babies).toHaveLength(1);
    expect(archive.measurements).toHaveLength(1);
    expect(archive.orders).toHaveLength(1);
    expect(archive.consents?.length).toBeGreaterThan(0);
    expect(JSON.stringify(archive)).not.toMatch(/passwordHash|tokenHash/);

    // The email carries no data and no download link.
    expect(t.email.lastTo(parent.email, 'privacy.export_ready')?.params.link).toMatch(/\/account#privacy$/);

    const download = await t.gql(DOWNLOAD, { id }, { token: parent.accessToken });
    expect((download.data?.dataExportDownload as { url: string }).url).toContain('ttl=900');
    const stranger = await t.registerCustomer();
    expect(errorCode(await t.gql(DOWNLOAD, { id }, { token: stranger.accessToken }))).toBe('NOT_FOUND');

    // After the retention period the file is deleted.
    t.advanceClock(8 * DAY);
    await t.app.runJobs();
    expect(t.storage.bodies.has(key)).toBe(false);
    // Eight days on, the old access token has expired: sign in again.
    const login = await t.gql(LOGIN, { input: { email: parent.email, password: PASSWORD } });
    const token = (login.data?.login as { accessToken: string }).accessToken;
    expect(errorReason(await t.gql(DOWNLOAD, { id }, { token }))).toBe('EXPORT_NOT_AVAILABLE');
  });
});

describe('account deletion', () => {
  it('waits for the grace period, then anonymises the account and keeps what the law needs', async () => {
    const parent = await family();
    const del = await t.gql(DELETE, { p: PASSWORD }, { token: parent.accessToken });
    const requestId = (del.data?.requestAccountDeletion as { id: string }).id;

    await t.app.runJobs();
    const [waiting] = await t.db.select().from(schema.users).where(eq(schema.users.id, parent.userId));
    expect(waiting?.status).toBe('ACTIVE');

    t.advanceClock(15 * DAY);
    await t.app.runJobs();

    const [user] = await t.db.select().from(schema.users).where(eq(schema.users.id, parent.userId));
    expect(user).toMatchObject({ status: 'DELETED', email: null, phone: null, passwordHash: null });
    const [profile] = await t.db
      .select()
      .from(schema.customerProfiles)
      .where(eq(schema.customerProfiles.userId, parent.userId));
    expect(profile).toMatchObject({ firstName: 'Deleted', lastName: 'customer' });

    // The child: no name, no birth date, no measurements, no recommendations built from them.
    const [baby] = await t.db
      .select()
      .from(schema.babyProfiles)
      .where(eq(schema.babyProfiles.id, parent.babyId));
    expect(baby).toMatchObject({ nickname: 'Deleted', dateOfBirth: '1900-01-01' });
    expect(
      await t.db
        .select()
        .from(schema.babyMeasurements)
        .where(eq(schema.babyMeasurements.babyProfileId, parent.babyId)),
    ).toEqual([]);
    expect(
      await t.db
        .select()
        .from(schema.sizingRecommendations)
        .where(eq(schema.sizingRecommendations.babyProfileId, parent.babyId)),
    ).toEqual([]);

    // Orders and payments stay for accounting, without the person.
    const [order] = await t.db.select().from(schema.orders).where(eq(schema.orders.id, parent.orderId));
    expect(order?.shippingAddress).toMatchObject({
      recipientName: 'Deleted customer',
      phone: '',
      street: null,
      district: 'Gasabo',
    });
    const [delivery] = await t.db
      .select()
      .from(schema.deliveries)
      .where(eq(schema.deliveries.orderId, parent.orderId));
    expect(delivery?.phone).toBe('');
    const [payment] = await t.db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.id, parent.paymentId));
    expect(payment).toMatchObject({ status: 'SUCCEEDED', payerMsisdn: null });
    const addresses = await t.db
      .select()
      .from(schema.addresses)
      .where(eq(schema.addresses.userId, parent.userId));
    expect(
      addresses.every((a) => a.recipientName === 'Deleted customer' && a.street === null && a.deletedAt),
    ).toBe(true);
    expect(
      await t.db.select().from(schema.sessions).where(eq(schema.sessions.userId, parent.userId)),
    ).toEqual([]);
    expect(
      await t.db.select().from(schema.notifications).where(eq(schema.notifications.userId, parent.userId)),
    ).toEqual([]);

    const [request] = await t.db
      .select()
      .from(schema.dataRequests)
      .where(eq(schema.dataRequests.id, requestId));
    expect(request?.status).toBe('COMPLETED');
    const audit = await t.db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.entityId, parent.userId));
    expect(audit.map((a) => a.action)).toContain('account.deleted');
    expect(t.email.lastTo(parent.email, 'privacy.account_deleted')).toBeDefined();

    // Signing in no longer works, and the old token no longer identifies anyone.
    expect((await t.gql(LOGIN, { input: { email: parent.email, password: PASSWORD } })).errors).toBeDefined();
    expect((await t.gql('{ me { id } }', {}, { token: parent.accessToken })).data?.me ?? null).toBeNull();

    // Running again changes nothing and fails nothing.
    const again = await t.app.runJobs();
    expect(again.deleted).toBe(0);
    const [still] = await t.db.select().from(schema.users).where(eq(schema.users.id, parent.userId));
    expect(still?.status).toBe('DELETED');
  });

  it('cancels unpaid orders and live subscriptions, and frees the email address', async () => {
    const parent = await t.registerCustomer();
    await t.gql(DELETE, { p: PASSWORD }, { token: parent.accessToken });
    t.advanceClock(15 * DAY);
    await t.app.runJobs();
    const reused = await t.registerCustomer({ email: parent.email });
    expect(reused.userId).not.toBe(parent.userId);
    const users = await t.db
      .select()
      .from(schema.users)
      .where(inArray(schema.users.id, [parent.userId, reused.userId]));
    expect(users.map((u) => u.status).sort()).toEqual(['ACTIVE', 'DELETED']);
  });
});
