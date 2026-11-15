import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrationsFolder } from './client';
import * as schema from './schema';

/**
 * Migration 0011 (payment reviews) applied to a database that already holds payments made under the previous
 * schema: the old rows must survive unchanged, must not be re-checked with the provider, and the queries the new
 * payment code runs must work on the result.
 */
const client = new PGlite();
const db = drizzle(client, { schema });
let previousFolder: string;
let userId: string;
let orderId: string;

const OLD_PAYMENTS = [
  { key: 'old-succeeded', status: 'SUCCEEDED', reference: 'ref-succeeded', completed: true },
  { key: 'old-failed', status: 'FAILED', reference: 'ref-failed', completed: true },
  { key: 'old-expired', status: 'EXPIRED', reference: 'ref-expired', completed: true },
  { key: 'old-cancelled', status: 'CANCELLED', reference: 'ref-cancelled', completed: false },
  { key: 'old-pending', status: 'PENDING', reference: 'ref-pending', completed: false },
  { key: 'old-initiated', status: 'INITIATED', reference: null, completed: false },
] as const;

beforeAll(async () => {
  // The migrations as they were before 0011.
  previousFolder = mkdtempSync(join(tmpdir(), 'bambino-migrations-'));
  cpSync(migrationsFolder, previousFolder, { recursive: true });
  const journalPath = join(previousFolder, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: { tag: string }[] };
  journal.entries = journal.entries.filter((entry) => entry.tag !== '0011_payment_reviews');
  writeFileSync(journalPath, JSON.stringify(journal));
  await migrate(db, { migrationsFolder: previousFolder });

  const [user] = await db.insert(schema.users).values({ email: 'old-customer@seed.test' }).returning();
  if (!user) throw new Error('no user');
  userId = user.id;
  const [order] = await db
    .insert(schema.orders)
    .values({
      orderNumber: 'BMB-OLD-1',
      userId,
      type: 'ONE_TIME',
      status: 'PAID',
      currency: 'RWF',
      subtotalAmount: 7000,
      totalAmount: 7000,
      shippingAddress: {
        recipientName: 'Old Customer',
        phone: '+250788123456',
        countryCode: 'RW',
        region: 'Kigali',
        district: 'Gasabo',
        sector: 'Kimironko',
        street: null,
        directions: null,
      },
      deliveryOptionCode: 'SEED-STANDARD',
      idempotencyKey: 'old-order-key',
    })
    .returning();
  if (!order) throw new Error('no order');
  orderId = order.id;
  // Written as plain SQL with the columns the previous schema had.
  for (const row of OLD_PAYMENTS) {
    await client.query(
      `INSERT INTO payments (user_id, order_id, provider, status, amount, currency, idempotency_key,
         provider_reference, initiated_at, completed_at)
       VALUES ($1, $2, 'MTN_MOMO', $3, 7000, 'RWF', $4, $5, '2026-10-01T08:00:00Z', $6)`,
      [userId, orderId, row.status, row.key, row.reference, row.completed ? '2026-10-01T08:05:00Z' : null],
    );
  }

  await migrate(db, { migrationsFolder });
}, 120_000);

afterAll(async () => {
  await client.close();
  rmSync(previousFolder, { recursive: true, force: true });
});

describe('migration 0011 on a database with existing payments', () => {
  it('keeps every existing payment as it was', async () => {
    const rows = await db.select().from(schema.payments);
    expect(rows).toHaveLength(OLD_PAYMENTS.length);
    for (const old of OLD_PAYMENTS) {
      const row = rows.find((entry) => entry.idempotencyKey === old.key);
      expect(row).toMatchObject({
        status: old.status,
        amount: 7000,
        providerReference: old.reference,
        orderId,
        userId,
        unapplied: false,
      });
    }
  });

  it('marks finished payments as settled, so old records are not re-checked or sent to review', async () => {
    const rows = await db.select().from(schema.payments);
    const settled = (key: string) =>
      rows.find((row) => row.idempotencyKey === key)?.providerSettledAt ?? null;
    for (const key of ['old-succeeded', 'old-failed', 'old-expired', 'old-cancelled']) {
      expect(settled(key), key).not.toBeNull();
    }
    expect(settled('old-pending')).toBeNull();
    expect(settled('old-initiated')).toBeNull();

    // The query reconciliation uses to find closed payments it must keep asking the provider about.
    const watched = await db
      .select()
      .from(schema.payments)
      .where(
        and(
          inArray(schema.payments.status, ['EXPIRED', 'CANCELLED', 'FAILED']),
          isNull(schema.payments.providerSettledAt),
          isNotNull(schema.payments.providerReference),
        ),
      );
    expect(watched).toHaveLength(0);
  });

  it('still refuses a second applied success for an order, and accepts an unapplied one', async () => {
    const second = {
      userId,
      orderId,
      provider: 'MTN_MOMO' as const,
      status: 'SUCCEEDED' as const,
      amount: 7000,
      currency: 'RWF',
    };
    await expect(
      db.insert(schema.payments).values({ ...second, idempotencyKey: 'new-duplicate' }),
    ).rejects.toThrow();
    const [late] = await db
      .insert(schema.payments)
      .values({ ...second, idempotencyKey: 'new-late', unapplied: true })
      .returning();
    expect(late).toMatchObject({ status: 'SUCCEEDED', unapplied: true });
  });

  it('stores one review per payment, lists open ones, and never deletes them', async () => {
    const [late] = await db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.idempotencyKey, 'new-late'));
    if (!late) throw new Error('no late payment');
    const [review] = await db
      .insert(schema.paymentReviews)
      .values({ paymentId: late.id, orderId, reason: 'ORDER_NOT_AWAITING_PAYMENT' })
      .returning();
    expect(review).toMatchObject({ resolvedAt: null, resolution: null });
    const again = await db
      .insert(schema.paymentReviews)
      .values({ paymentId: late.id, orderId, reason: 'ORDER_NOT_AWAITING_PAYMENT' })
      .onConflictDoNothing()
      .returning();
    expect(again).toHaveLength(0);

    const open = await db
      .select()
      .from(schema.paymentReviews)
      .where(isNull(schema.paymentReviews.resolvedAt));
    expect(open).toHaveLength(1);
    await db
      .update(schema.paymentReviews)
      .set({ resolution: 'REFUNDED', resolutionNote: 'Refunded', resolvedBy: userId, resolvedAt: new Date() })
      .where(eq(schema.paymentReviews.paymentId, late.id));
    expect(
      await db.select().from(schema.paymentReviews).where(isNull(schema.paymentReviews.resolvedAt)),
    ).toHaveLength(0);
    await expect(db.delete(schema.paymentReviews)).rejects.toThrow();
  });
});
