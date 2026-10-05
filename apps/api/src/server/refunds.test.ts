import { randomUUID } from 'node:crypto';
import { schema } from '@bambino/database';
import { eq } from '@bambino/database/orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MOCK_SIGNATURE_HEADER, MOCK_WALLETS, MockPaymentProvider } from '../providers/payments';
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

const REFUND_FIELDS =
  'refund { id status method amount { amount } } paymentId orderNumber reason failureCode';
const REQUEST = `mutation ($input: RefundInput!) { adminRequestRefund(input: $input) { ${REFUND_FIELDS} } }`;
const APPROVE = `mutation ($id: ID!) { adminApproveRefund(id: $id) { ${REFUND_FIELDS} providerReference } }`;
const REJECT = `mutation ($id: ID!) { adminRejectRefund(id: $id, note: "Duplicate request") { ${REFUND_FIELDS} } }`;
const ORDER_REFUNDS = 'query ($id: ID!) { order(id: $id) { status refunds { status amount { amount } } } }';
const ADMIN_ORDER = `query ($id: ID!) { adminOrder(id: $id) { payments { payment { status }
  refundableAmount { amount } refundMethods refunds { refund { status } } } } }`;

let sequence = 0;

/** A customer with a paid one-time order (the mock wallet that approves). */
async function paidOrder() {
  const customer = await t.registerCustomer();
  const token = customer.accessToken;
  const address = await t.gql(
    'mutation ($input: AddressInput!) { createAddress(input: $input) { id } }',
    { input: kigali },
    { token },
  );
  const addressId = (address.data?.createAddress as { id: string }).id;
  const product = (await t.gql('{ product(slug: "seed-footed-romper") { variants { id } } }')).data
    ?.product as { variants: { id: string }[] };
  const variant = product.variants[sequence++ % product.variants.length];
  await t.gql(
    'mutation ($id: ID!) { addToCart(variantId: $id, quantity: 1) { id } }',
    { id: variant?.id },
    { token },
  );
  const created = await t.gql(
    'mutation ($input: CreateOrderInput!) { createOrder(input: $input) { id orderNumber totals { total { amount } } } }',
    {
      input: {
        idempotencyKey: randomUUID(),
        checkout: { shippingAddressId: addressId, deliveryOptionCode: 'SEED-STANDARD' },
      },
    },
    { token },
  );
  if (created.errors) throw new Error(JSON.stringify(created.errors));
  const order = created.data?.createOrder as {
    id: string;
    orderNumber: string;
    totals: { total: { amount: number } };
  };
  const paid = await t.gql(
    'mutation ($input: InitiatePaymentInput!) { initiatePayment(input: $input) { id } }',
    {
      input: {
        idempotencyKey: randomUUID(),
        orderId: order.id,
        provider: 'MOCK',
        msisdn: MOCK_WALLETS.approves,
      },
    },
    { token },
  );
  const paymentId = (paid.data?.initiatePayment as { id: string }).id;
  // The first status check confirms the mock payment.
  await t.gql('query ($id: ID!) { payment(id: $id) { status } }', { id: paymentId }, { token });
  return { customer, order, paymentId, total: order.totals.total.amount };
}

function requestInput(paymentId: string, amount: number, extra: Record<string, unknown> = {}) {
  return {
    input: {
      idempotencyKey: randomUUID(),
      paymentId,
      amount,
      method: 'PROVIDER',
      reason: 'Damaged on arrival',
      ...extra,
    },
  };
}

async function refundRow(id: string) {
  const [row] = await t.db.select().from(schema.refunds).where(eq(schema.refunds.id, id));
  if (!row) throw new Error('refund not found');
  return row;
}

describe('refunds', () => {
  it('needs refund:write to request, and refund:read to see', async () => {
    const support = await t.registerStaff('CUSTOMER_SUPPORT');
    const { paymentId, total } = await paidOrder();
    expect(
      errorCode(await t.gql(REQUEST, requestInput(paymentId, total), { token: support.accessToken })),
    ).toBe('FORBIDDEN');
    const list = await t.gql('{ adminRefunds { totalCount } }', {}, { token: support.accessToken });
    expect(list.errors).toBeUndefined();
  });

  it('refunds part of a payment through the provider, confirmed asynchronously, and audits each step', async () => {
    const finance = await t.registerStaff('FINANCE');
    const token = finance.accessToken;
    const { customer, order, paymentId, total } = await paidOrder();
    const part = Math.floor(total / 4);

    const requested = await t.gql(REQUEST, requestInput(paymentId, part), { token });
    const refund = (requested.data?.adminRequestRefund as { refund: { id: string; status: string } }).refund;
    expect(refund.status).toBe('REQUESTED');

    const approved = (await t.gql(APPROVE, { id: refund.id }, { token })).data?.adminApproveRefund as {
      refund: { status: string };
      providerReference: string;
    };
    // Accepted by the provider, not finished: no money is reported back until it confirms.
    expect(approved.refund.status).toBe('PROCESSING');
    expect(approved.providerReference).toMatch(/^mock-refund-/);

    await t.app.runJobs();
    expect((await refundRow(refund.id)).status).toBe('SUCCEEDED');
    const [payment] = await t.db.select().from(schema.payments).where(eq(schema.payments.id, paymentId));
    expect(payment?.status).toBe('SUCCEEDED'); // partly refunded: still a successful payment
    const transactions = await t.db
      .select()
      .from(schema.paymentTransactions)
      .where(eq(schema.paymentTransactions.paymentId, paymentId));
    expect(transactions.filter((tx) => tx.type === 'REFUND').map((tx) => tx.amount)).toEqual([part]);

    const actions = (
      await t.db.select().from(schema.auditLogs).where(eq(schema.auditLogs.entityId, refund.id))
    ).map((row) => row.action);
    expect(actions.sort()).toEqual(['refund.approved', 'refund.requested', 'refund.succeeded']);

    const notifications = await t.db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.userId, customer.userId));
    expect(notifications.map((n) => n.type)).toContain('REFUND_SUCCEEDED');

    const view = await t.gql(ORDER_REFUNDS, { id: order.id }, { token: customer.accessToken });
    expect(view.data?.order).toMatchObject({ refunds: [{ status: 'SUCCEEDED', amount: { amount: part } }] });

    const admin = (await t.gql(ADMIN_ORDER, { id: order.id }, { token })).data?.adminOrder as {
      payments: { refundableAmount: { amount: number }; refundMethods: string[] }[];
    };
    expect(admin.payments[0]?.refundableAmount.amount).toBe(total - part);
    // Exchange credit is not offered while the policy placeholder says no.
    expect(admin.payments[0]?.refundMethods).toEqual(['PROVIDER']);
  });

  it('never refunds more than was paid, counting refunds still waiting', async () => {
    const finance = await t.registerStaff('FINANCE');
    const token = finance.accessToken;
    const { paymentId, total } = await paidOrder();
    expect(errorReason(await t.gql(REQUEST, requestInput(paymentId, total + 1), { token }))).toBe(
      'REFUND_EXCEEDS_PAYMENT',
    );
    expect((await t.gql(REQUEST, requestInput(paymentId, total - 100), { token })).errors).toBeUndefined();
    expect(errorReason(await t.gql(REQUEST, requestInput(paymentId, 101), { token }))).toBe(
      'REFUND_EXCEEDS_PAYMENT',
    );
    expect((await t.gql(REQUEST, requestInput(paymentId, 100), { token })).errors).toBeUndefined();
  });

  it('marks the payment REFUNDED once refunds cover all of it, via a signed webhook applied once', async () => {
    const finance = await t.registerStaff('FINANCE');
    const token = finance.accessToken;
    const { paymentId, total } = await paidOrder();
    const id = (
      (await t.gql(REQUEST, requestInput(paymentId, total), { token })).data?.adminRequestRefund as {
        refund: { id: string };
      }
    ).refund.id;
    const approved = (await t.gql(APPROVE, { id }, { token })).data?.adminApproveRefund as {
      providerReference: string;
    };

    const body = JSON.stringify({ eventId: `evt-refund-${id}`, reference: approved.providerReference });
    const send = () =>
      t.app.handleWebhook(
        new Request('http://api.test/webhooks/payments/mock', {
          method: 'POST',
          headers: { 'content-type': 'application/json', [MOCK_SIGNATURE_HEADER]: t.mockPayments.sign(body) },
          body,
        }),
      );
    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(200); // replay: stored once, changes nothing
    expect((await refundRow(id)).status).toBe('SUCCEEDED');
    const [payment] = await t.db.select().from(schema.payments).where(eq(schema.payments.id, paymentId));
    expect(payment?.status).toBe('REFUNDED');
    const [event] = await t.db
      .select()
      .from(schema.webhookEvents)
      .where(eq(schema.webhookEvents.providerEventId, `evt-refund-${id}`));
    expect(event?.processingError).toBeNull();
    // Nothing left to refund.
    expect(errorReason(await t.gql(REQUEST, requestInput(paymentId, 1), { token }))).toBe(
      'PAYMENT_NOT_REFUNDABLE',
    );
  });

  it('returns the same refund for a repeated request key, and the provider sees one refund per key', async () => {
    const finance = await t.registerStaff('FINANCE');
    const token = finance.accessToken;
    const { paymentId } = await paidOrder();
    const input = requestInput(paymentId, 500);
    const first = (await t.gql(REQUEST, input, { token })).data?.adminRequestRefund as {
      refund: { id: string };
    };
    const second = (await t.gql(REQUEST, input, { token })).data?.adminRequestRefund as {
      refund: { id: string };
    };
    expect(second.refund.id).toBe(first.refund.id);

    const provider = new MockPaymentProvider('secret-for-this-test', 10, () => new Date());
    const request = {
      reference: 'refund-key-1',
      paymentProviderReference: 'mock-x',
      amount: { amount: 500, currency: 'RWF' as const },
    };
    expect((await provider.refund(request)).providerReference).toBe(
      (await provider.refund(request)).providerReference,
    );
  });

  it('rejects a refund, tells the customer and frees the amount', async () => {
    const finance = await t.registerStaff('FINANCE');
    const token = finance.accessToken;
    const { customer, paymentId, total } = await paidOrder();
    const id = (
      (await t.gql(REQUEST, requestInput(paymentId, total), { token })).data?.adminRequestRefund as {
        refund: { id: string };
      }
    ).refund.id;
    const rejected = (await t.gql(REJECT, { id }, { token })).data?.adminRejectRefund as {
      refund: { status: string };
    };
    expect(rejected.refund.status).toBe('REJECTED');
    expect(errorCode(await t.gql(APPROVE, { id }, { token }))).toBe('CONFLICT');
    const notifications = await t.db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.userId, customer.userId));
    expect(notifications.map((n) => n.type)).toContain('REFUND_REJECTED');
    expect((await t.gql(REQUEST, requestInput(paymentId, total), { token })).errors).toBeUndefined();
  });

  it('refuses exchange credit as a refund method while the policy does not allow it', async () => {
    const finance = await t.registerStaff('FINANCE');
    const { paymentId } = await paidOrder();
    expect(
      errorReason(
        await t.gql(REQUEST, requestInput(paymentId, 100, { method: 'CREDIT' }), {
          token: finance.accessToken,
        }),
      ),
    ).toBe('REFUND_AS_CREDIT_NOT_ALLOWED');
  });

  it('fails the refund when the provider refuses it, leaving the amount refundable again', async () => {
    const finance = await t.registerStaff('FINANCE');
    const token = finance.accessToken;
    const { paymentId, total } = await paidOrder();
    const id = (
      (await t.gql(REQUEST, requestInput(paymentId, total), { token })).data?.adminRequestRefund as {
        refund: { id: string };
      }
    ).refund.id;
    const original = t.mockPayments.refund.bind(t.mockPayments);
    t.mockPayments.refund = async () => {
      throw new Error('provider unavailable');
    };
    try {
      const failed = (await t.gql(APPROVE, { id }, { token })).data?.adminApproveRefund as {
        refund: { status: string };
        failureCode: string;
      };
      expect(failed).toMatchObject({ refund: { status: 'FAILED' }, failureCode: 'PROVIDER_ERROR' });
    } finally {
      t.mockPayments.refund = original;
    }
    expect((await t.gql(REQUEST, requestInput(paymentId, total), { token })).errors).toBeUndefined();
  });
});

describe('cancelling a paid order', () => {
  const CANCEL = 'mutation ($id: ID!) { cancelOrder(id: $id) { status } }';
  const STAFF_CANCEL =
    'mutation ($id: ID!) { adminUpdateOrderStatus(orderId: $id, status: CANCELLED, note: "Out of stock") { status } }';

  it('lets the customer cancel before preparation, requesting a full refund for staff approval', async () => {
    const { customer, order, total } = await paidOrder();
    const response = await t.gql(CANCEL, { id: order.id }, { token: customer.accessToken });
    expect(response.data?.cancelOrder).toEqual({ status: 'CANCELLED' });
    const view = await t.gql(ORDER_REFUNDS, { id: order.id }, { token: customer.accessToken });
    expect(view.data?.order).toEqual({
      status: 'CANCELLED',
      refunds: [{ status: 'REQUESTED', amount: { amount: total } }],
    });
    // The sold stock is back on hand.
    const restocked = await t.db
      .select()
      .from(schema.inventoryMovements)
      .where(eq(schema.inventoryMovements.referenceId, order.id));
    expect(restocked.filter((m) => m.reason === 'ADJUSTMENT').map((m) => m.onHandDelta)).toEqual([1]);
  });

  it('refuses a customer cancellation once the order is being prepared', async () => {
    const ops = await t.registerStaff('OPERATIONS_MANAGER');
    const { customer, order } = await paidOrder();
    await t.gql(
      'mutation ($id: ID!) { adminUpdateOrderStatus(orderId: $id, status: PROCESSING) { status } }',
      { id: order.id },
      { token: ops.accessToken },
    );
    expect(errorReason(await t.gql(CANCEL, { id: order.id }, { token: customer.accessToken }))).toBe(
      'ORDER_NOT_CANCELLABLE',
    );
    // Staff can still cancel it, which requests the refund.
    expect(
      (await t.gql(STAFF_CANCEL, { id: order.id }, { token: ops.accessToken })).data?.adminUpdateOrderStatus,
    ).toEqual({
      status: 'CANCELLED',
    });
    const refunds = await t.db.select().from(schema.refunds).where(eq(schema.refunds.orderId, order.id));
    expect(refunds.map((r) => r.status)).toEqual(['REQUESTED']);
  });
});
