import { sql } from 'drizzle-orm';
import { bigint, check, date, index, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { mediaAssets } from './catalogue';
import { createdAt, id, tstz, updatedAt } from './columns';
import { type AddressSnapshot, orders } from './commerce';
import { deliveryDirection, deliveryStatus } from './enums';
import { users } from './identity';
import { returnRequests } from './returns';

/** A physical movement: an order going out, or a return being collected. */
export const deliveries = pgTable(
  'deliveries',
  {
    id: id(),
    direction: deliveryDirection('direction').notNull().default('OUTBOUND'),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'restrict' }),
    returnRequestId: uuid('return_request_id').references(() => returnRequests.id, { onDelete: 'restrict' }),
    address: jsonb('address').$type<AddressSnapshot>().notNull(),
    phone: text('phone').notNull(),
    /** Key of the DeliveryProvider implementation handling this delivery. */
    deliveryProvider: text('delivery_provider').notNull(),
    trackingNumber: text('tracking_number'),
    status: deliveryStatus('status').notNull().default('PENDING'),
    estimatedDeliveryDate: date('estimated_delivery_date'),
    deliveredAt: tstz('delivered_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('deliveries_order_idx').on(t.orderId),
    index('deliveries_return_request_idx').on(t.returnRequestId),
    index('deliveries_status_idx').on(t.status),
    index('deliveries_tracking_idx').on(t.deliveryProvider, t.trackingNumber),
    // One open pickup per return: a repeated request cannot book the courier twice. A failed or cancelled run
    // does not count, so a new one can be arranged.
    uniqueIndex('deliveries_one_open_pickup_per_return_uq')
      .on(t.returnRequestId)
      .where(sql`${t.direction} = 'RETURN_PICKUP' AND ${t.status} NOT IN ('FAILED', 'CANCELLED')`),
    check(
      'deliveries_target_matches_direction',
      sql`(${t.direction} = 'OUTBOUND' AND ${t.orderId} IS NOT NULL)
        OR (${t.direction} = 'RETURN_PICKUP' AND ${t.returnRequestId} IS NOT NULL)`,
    ),
  ],
);

/** Tracking timeline shown to the customer. */
export const deliveryEvents = pgTable(
  'delivery_events',
  {
    id: id(),
    deliveryId: uuid('delivery_id')
      .notNull()
      .references(() => deliveries.id, { onDelete: 'cascade' }),
    status: deliveryStatus('status').notNull(),
    note: text('note'),
    evidenceAssetId: uuid('evidence_asset_id').references(() => mediaAssets.id, { onDelete: 'set null' }),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    occurredAt: tstz('occurred_at').notNull().defaultNow(),
    /** Total order of events, even when timestamps are equal. */
    sequence: bigint('sequence', { mode: 'number' }).generatedAlwaysAsIdentity(),
  },
  (t) => [index('delivery_events_delivery_idx').on(t.deliveryId, t.occurredAt)],
);
