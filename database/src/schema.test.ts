import { eq, getTableName, is, sql } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryRows } from './client';
import * as schema from './schema';
import { type TestDatabase, createTestDatabase } from './testing';

let db: TestDatabase;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
}, 60_000);

afterAll(async () => {
  await close();
});

/** Asserts the statement is rejected by PostgreSQL, naming the constraint or trigger message. */
async function expectRejected(statement: Promise<unknown>, pattern: RegExp) {
  let failure: unknown;
  try {
    await statement;
  } catch (error) {
    failure = error;
  }
  expect(failure, 'expected the database to reject this statement').toBeDefined();
  const cause = failure instanceof Error ? failure.cause : undefined;
  expect(`${String(failure)} ${String(cause)}`).toMatch(pattern);
}

let sequence = 0;
const unique = (prefix: string) => `${prefix}-${++sequence}`;

/** The single row a statement returned; fails the test if there was none. */
function one<T>(rows: T[]): T {
  const [row] = rows;
  if (row === undefined) throw new Error('Expected the statement to return a row');
  return row;
}

async function createUser() {
  const user = one(
    await db
      .insert(schema.users)
      .values({ email: `${unique('parent')}@seed.test` })
      .returning(),
  );
  return user;
}

const address = {
  recipientName: 'Seed Parent',
  phone: '+250700000000',
  countryCode: 'RW',
  region: 'Kigali',
  district: 'Gasabo',
  sector: 'Kimironko',
  street: null,
  directions: null,
};

async function createVariant() {
  const sizeCode = unique('SZ');
  await db.insert(schema.sizes).values({ code: sizeCode, label: sizeCode, sortOrder: sequence });
  const category = one(
    await db
      .insert(schema.categories)
      .values({ slug: unique('bodysuits'), name: 'Bodysuits' })
      .returning(),
  );
  const product = one(
    await db
      .insert(schema.products)
      .values({
        slug: unique('organic-bodysuit'),
        name: 'Organic bodysuit',
        description: 'Seed product',
        brand: 'Bambino',
        categoryId: category.id,
      })
      .returning(),
  );
  const variant = one(
    await db
      .insert(schema.productVariants)
      .values({
        productId: product.id,
        sku: unique('SKU'),
        sizeCode,
        color: 'Sand',
        priceAmount: 10_500,
        currency: 'RWF',
      })
      .returning(),
  );
  return variant;
}

async function createOrder(userId: string, overrides: Partial<typeof schema.orders.$inferInsert> = {}) {
  const order = one(
    await db
      .insert(schema.orders)
      .values({
        orderNumber: unique('BMB'),
        userId,
        type: 'ONE_TIME',
        currency: 'RWF',
        subtotalAmount: 21_000,
        shippingAmount: 2_000,
        totalAmount: 23_000,
        shippingAddress: address,
        deliveryOptionCode: 'STANDARD',
        idempotencyKey: unique('idem'),
        ...overrides,
      })
      .returning(),
  );
  return order;
}

async function createGarment(variantId: string) {
  const garment = one(
    await db
      .insert(schema.garments)
      .values({ tagCode: unique('BMB-G'), variantId })
      .returning(),
  );
  return garment;
}

describe('migrations', () => {
  it('create exactly the tables defined in the schema', async () => {
    const exported: unknown[] = Object.values(schema);
    const defined = exported
      .filter((value): value is PgTable => is(value, PgTable))
      .map((table) => getTableName(table))
      .sort();
    const result = await queryRows<{ table_name: string }>(
      db,
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
    );
    expect(result.map((row) => row.table_name)).toEqual(defined);
    expect(defined).toHaveLength(56);
  });

  it('cover every entity named in the specification', async () => {
    const required = [
      'users',
      'roles',
      'permissions',
      'customer_profiles',
      'baby_profiles',
      'baby_measurements',
      'products',
      'product_variants',
      'categories',
      'inventory_items',
      'garments',
      'garment_lifecycle_events',
      'subscription_plans',
      'subscriptions',
      'subscription_items',
      'carts',
      'cart_items',
      'orders',
      'order_items',
      'payments',
      'payment_transactions',
      'addresses',
      'deliveries',
      'return_requests',
      'return_items',
      'exchanges',
      'exchange_items',
      'exchange_credits',
      'sizing_recommendations',
      'sizing_measurements',
      'notifications',
      'promotions',
      'discounts',
      'audit_logs',
    ];
    const result = await queryRows<{ table_name: string }>(
      db,
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const existing = new Set(result.map((row) => row.table_name));
    expect(required.filter((name) => !existing.has(name))).toEqual([]);
  });
});

describe('identity', () => {
  it('treats emails as unique regardless of case', async () => {
    await db.insert(schema.users).values({ email: 'Case@seed.test' });
    await expectRejected(db.insert(schema.users).values({ email: 'case@SEED.test' }), /users_email_lower_uq/);
  });

  it('requires an email or phone for a live account', async () => {
    await expectRejected(db.insert(schema.users).values({}), /users_has_identifier/);
  });

  it('allows only one default address per user', async () => {
    const user = await createUser();
    const base = { userId: user.id, recipientName: 'Seed Parent', phone: '+250700000000', countryCode: 'RW' };
    await db.insert(schema.addresses).values({ ...base, isDefault: true });
    await db.insert(schema.addresses).values({ ...base, isDefault: false });
    await expectRejected(
      db.insert(schema.addresses).values({ ...base, isDefault: true }),
      /addresses_one_default_per_user_uq/,
    );
  });
});

describe('commerce integrity', () => {
  it('allows one active cart per user and rejects non-positive quantities', async () => {
    const user = await createUser();
    const variant = await createVariant();
    const cart = one(await db.insert(schema.carts).values({ userId: user.id, currency: 'RWF' }).returning());
    await expectRejected(
      db.insert(schema.carts).values({ userId: user.id, currency: 'RWF' }),
      /carts_one_active_per_user_uq/,
    );
    await expectRejected(
      db.insert(schema.cartItems).values({ cartId: cart.id, variantId: variant.id, quantity: 0 }),
      /cart_items_quantity_positive/,
    );
  });

  it('never lets reserved stock exceed stock on hand', async () => {
    const variant = await createVariant();
    await expectRejected(
      db
        .insert(schema.inventoryItems)
        .values({ variantId: variant.id, locationCode: 'KGL-MAIN', quantityOnHand: 2, quantityReserved: 3 }),
      /inventory_items_quantities_valid/,
    );
  });

  it('rejects an order whose total does not match its parts', async () => {
    const user = await createUser();
    await expect(createOrder(user.id)).resolves.toMatchObject({ totalAmount: 23_000 });
    await expectRejected(createOrder(user.id, { totalAmount: 1 }), /orders_total_is_consistent/);
    await expectRejected(
      createOrder(user.id, { discountAmount: -5_000, totalAmount: 28_000 }),
      /orders_amounts_non_negative/,
    );
  });

  it('rejects a duplicate checkout submission for the same user', async () => {
    const user = await createUser();
    await createOrder(user.id, { idempotencyKey: 'checkout-1' });
    await expectRejected(
      createOrder(user.id, { idempotencyKey: 'checkout-1' }),
      /orders_user_idempotency_uq/,
    );
  });

  it('rejects an order line whose total is not price times quantity', async () => {
    const user = await createUser();
    const variant = await createVariant();
    const order = await createOrder(user.id);
    const line = {
      orderId: order.id,
      variantId: variant.id,
      productName: 'Organic bodysuit',
      sku: variant.sku,
      sizeCode: variant.sizeCode,
      color: variant.color,
      unitPriceAmount: 10_500,
      quantity: 2,
    };
    await db.insert(schema.orderItems).values({ ...line, lineTotalAmount: 21_000 });
    await expectRejected(
      db.insert(schema.orderItems).values({ ...line, lineTotalAmount: 10_500 }),
      /order_items_line_total_is_consistent/,
    );
  });

  it('requires a promotion value that matches its type', async () => {
    const base = { name: 'Seed promo', scope: 'ORDER' as const, currency: 'RWF', startsAt: new Date() };
    await db
      .insert(schema.promotions)
      .values({ ...base, code: 'WELCOME10', discountType: 'PERCENTAGE', percentBasisPoints: 1_000 });
    await expectRejected(
      db.insert(schema.promotions).values({ ...base, code: 'welcome10', discountType: 'FREE_SHIPPING' }),
      /promotions_code_upper_uq/,
    );
    await expectRejected(
      db
        .insert(schema.promotions)
        .values({ ...base, code: 'BAD', discountType: 'PERCENTAGE', percentBasisPoints: 20_000 }),
      /promotions_value_matches_type/,
    );
  });
});

describe('payment integrity', () => {
  it('allows at most one successful payment per order', async () => {
    const user = await createUser();
    const order = await createOrder(user.id);
    const payment = {
      userId: user.id,
      orderId: order.id,
      provider: 'MOCK' as const,
      amount: 23_000,
      currency: 'RWF',
    };
    await db.insert(schema.payments).values({ ...payment, idempotencyKey: unique('pay'), status: 'FAILED' });
    await db
      .insert(schema.payments)
      .values({ ...payment, idempotencyKey: unique('pay'), status: 'SUCCEEDED' });
    await expectRejected(
      db.insert(schema.payments).values({ ...payment, idempotencyKey: unique('pay'), status: 'SUCCEEDED' }),
      /payments_one_success_per_order_uq/,
    );
  });

  it('rejects a reused idempotency key and a payment with no target', async () => {
    const user = await createUser();
    const order = await createOrder(user.id);
    const payment = { userId: user.id, provider: 'MOCK' as const, amount: 23_000, currency: 'RWF' };
    await db.insert(schema.payments).values({ ...payment, orderId: order.id, idempotencyKey: 'pay-fixed' });
    await expectRejected(
      db.insert(schema.payments).values({ ...payment, orderId: order.id, idempotencyKey: 'pay-fixed' }),
      /payments_idempotency_key_uq/,
    );
    await expectRejected(
      db.insert(schema.payments).values({ ...payment, idempotencyKey: unique('pay') }),
      /payments_has_target/,
    );
  });

  it('stores a replayed webhook only once', async () => {
    const event = {
      provider: 'MTN_MOMO' as const,
      providerEventId: 'evt-1',
      signatureValid: true,
      payload: {},
    };
    await db.insert(schema.webhookEvents).values(event);
    await expectRejected(db.insert(schema.webhookEvents).values(event), /webhook_events_provider_event_uq/);
  });

  it('keeps payment transactions append-only', async () => {
    const user = await createUser();
    const order = await createOrder(user.id);
    const payment = one(
      await db
        .insert(schema.payments)
        .values({
          userId: user.id,
          orderId: order.id,
          provider: 'MOCK',
          amount: 23_000,
          currency: 'RWF',
          idempotencyKey: unique('pay'),
        })
        .returning(),
    );
    const transaction = one(
      await db
        .insert(schema.paymentTransactions)
        .values({
          paymentId: payment.id,
          type: 'INITIATION',
          resultingStatus: 'PENDING',
          amount: 23_000,
          currency: 'RWF',
        })
        .returning(),
    );
    await expectRejected(
      db
        .update(schema.paymentTransactions)
        .set({ amount: 1 })
        .where(eq(schema.paymentTransactions.id, transaction.id)),
      /append-only/,
    );
    await expectRejected(
      db.delete(schema.paymentTransactions).where(eq(schema.paymentTransactions.id, transaction.id)),
      /append-only/,
    );
  });
});

describe('garment lifecycle integrity', () => {
  it('never deletes a garment', async () => {
    const garment = await createGarment((await createVariant()).id);
    await expectRejected(
      db.delete(schema.garments).where(eq(schema.garments.id, garment.id)),
      /cannot be deleted/,
    );
  });

  it('requires a customer while a garment is with a customer', async () => {
    const garment = await createGarment((await createVariant()).id);
    await expectRejected(
      db.update(schema.garments).set({ status: 'WITH_CUSTOMER' }).where(eq(schema.garments.id, garment.id)),
      /garments_customer_matches_status/,
    );
    const user = await createUser();
    await db
      .update(schema.garments)
      .set({ status: 'WITH_CUSTOMER', currentCustomerId: user.id })
      .where(eq(schema.garments.id, garment.id));
  });

  it('keeps lifecycle events append-only', async () => {
    const garment = await createGarment((await createVariant()).id);
    const event = one(
      await db
        .insert(schema.garmentLifecycleEvents)
        .values({ garmentId: garment.id, eventType: 'PROCURED', newStatus: 'PROCURED', newCondition: 'NEW' })
        .returning(),
    );
    await expectRejected(
      db
        .update(schema.garmentLifecycleEvents)
        .set({ newStatus: 'RETIRED' })
        .where(eq(schema.garmentLifecycleEvents.id, event.id)),
      /append-only/,
    );
    await expectRejected(
      db.delete(schema.garmentLifecycleEvents).where(eq(schema.garmentLifecycleEvents.id, event.id)),
      /append-only/,
    );
  });
});

describe('subscription integrity', () => {
  it('allows one live subscription per baby but keeps ended ones as history', async () => {
    const user = await createUser();
    const baby = one(
      await db
        .insert(schema.babyProfiles)
        .values({ userId: user.id, nickname: 'Seed baby', dateOfBirth: '2026-03-01' })
        .returning(),
    );
    const plan = one(
      await db
        .insert(schema.subscriptionPlans)
        .values({
          code: unique('PLAN'),
          name: 'Seed monthly',
          description: 'Seed plan',
          marketCode: 'RW',
          billingInterval: 'MONTHLY',
          priceAmount: 30_000,
          currency: 'RWF',
          itemsPerCycle: 5,
          exchangePolicy: { exchangesPerCycle: null },
        })
        .returning(),
    );
    const subscription = {
      userId: user.id,
      babyProfileId: baby.id,
      planId: plan.id,
      priceAmount: plan.priceAmount,
      currency: 'RWF',
    };
    await db.insert(schema.subscriptions).values({ ...subscription, status: 'CANCELLED' });
    await db.insert(schema.subscriptions).values({ ...subscription, status: 'ACTIVE' });
    await expectRejected(
      db.insert(schema.subscriptions).values({ ...subscription, status: 'PENDING' }),
      /subscriptions_one_live_per_baby_uq/,
    );
  });
});

describe('exchange credit ledger', () => {
  it('enforces entry signs, single earning per returned garment, and immutability', async () => {
    const user = await createUser();
    const garment = await createGarment((await createVariant()).id);
    const request = one(
      await db
        .insert(schema.returnRequests)
        .values({ returnNumber: unique('RET'), userId: user.id, reason: 'OUTGROWN' })
        .returning(),
    );
    const item = one(
      await db
        .insert(schema.returnItems)
        .values({ returnRequestId: request.id, garmentId: garment.id })
        .returning(),
    );

    const credit = { userId: user.id, currency: 'RWF' };
    const earned = one(
      await db
        .insert(schema.exchangeCredits)
        .values({ ...credit, entryType: 'EARNED', amount: 6_000, returnItemId: item.id })
        .returning(),
    );
    await db.insert(schema.exchangeCredits).values({ ...credit, entryType: 'REDEEMED', amount: -2_500 });

    await expectRejected(
      db
        .insert(schema.exchangeCredits)
        .values({ ...credit, entryType: 'EARNED', amount: 6_000, returnItemId: item.id }),
      /exchange_credits_one_earning_per_return_item_uq/,
    );
    await expectRejected(
      db.insert(schema.exchangeCredits).values({ ...credit, entryType: 'REDEEMED', amount: 2_500 }),
      /exchange_credits_sign_matches_type/,
    );
    await expectRejected(
      db
        .update(schema.exchangeCredits)
        .set({ amount: 60_000 })
        .where(eq(schema.exchangeCredits.id, earned.id)),
      /append-only/,
    );

    const balance = one(
      await db
        .select({ total: sql<number>`sum(${schema.exchangeCredits.amount})::int` })
        .from(schema.exchangeCredits)
        .where(eq(schema.exchangeCredits.userId, user.id)),
    );
    expect(balance.total).toBe(3_500);
  });

  it('cannot record an inspection outcome without an inspection', async () => {
    const user = await createUser();
    const garment = await createGarment((await createVariant()).id);
    const request = one(
      await db
        .insert(schema.returnRequests)
        .values({ returnNumber: unique('RET'), userId: user.id, reason: 'OUTGROWN' })
        .returning(),
    );
    await expectRejected(
      db
        .insert(schema.returnItems)
        .values({ returnRequestId: request.id, garmentId: garment.id, outcome: 'ACCEPTED' }),
      /return_items_outcome_requires_inspection/,
    );
  });
});

describe('audit log', () => {
  it('is append-only', async () => {
    const entry = one(
      await db
        .insert(schema.auditLogs)
        .values({ action: 'product.price_changed', entityType: 'product_variant', entityId: 'seed' })
        .returning(),
    );
    await expectRejected(
      db.update(schema.auditLogs).set({ action: 'tampered' }).where(eq(schema.auditLogs.id, entry.id)),
      /append-only/,
    );
    await expectRejected(db.delete(schema.auditLogs).where(eq(schema.auditLogs.id, entry.id)), /append-only/);
  });
});
