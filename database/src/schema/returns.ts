import { sql } from 'drizzle-orm';
import { check, index, pgTable, primaryKey, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { mediaAssets, productVariants } from './catalogue';
import { amount, createdAt, currency, id, tstz, updatedAt } from './columns';
import { orderItems, orders } from './commerce';
import {
  exchangeCreditEntryType,
  exchangeStatus,
  fitOutcome,
  garmentCondition,
  returnItemOutcome,
  returnReason,
  returnStatus,
} from './enums';
import { garments } from './garments';
import { users } from './identity';
import { subscriptions } from './subscriptions';

export const returnRequests = pgTable(
  'return_requests',
  {
    id: id(),
    returnNumber: text('return_number').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'restrict' }),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id, { onDelete: 'restrict' }),
    status: returnStatus('status').notNull().default('REQUESTED'),
    reason: returnReason('reason').notNull(),
    customerNote: text('customer_note'),
    decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: tstz('decided_at'),
    rejectionReason: text('rejection_reason'),
    receivedAt: tstz('received_at'),
    completedAt: tstz('completed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('return_requests_number_uq').on(t.returnNumber),
    index('return_requests_user_idx').on(t.userId, t.createdAt),
    index('return_requests_status_idx').on(t.status),
  ],
);

/** One garment within a return, with what the customer reported and what inspection found. */
export const returnItems = pgTable(
  'return_items',
  {
    id: id(),
    returnRequestId: uuid('return_request_id')
      .notNull()
      .references(() => returnRequests.id, { onDelete: 'cascade' }),
    garmentId: uuid('garment_id')
      .notNull()
      .references(() => garments.id, { onDelete: 'restrict' }),
    orderItemId: uuid('order_item_id').references(() => orderItems.id, { onDelete: 'set null' }),
    /** How the garment fitted, as reported by the parent. Feeds future sizing improvements. */
    reportedFit: fitOutcome('reported_fit'),
    inspectedCondition: garmentCondition('inspected_condition'),
    inspectionNotes: text('inspection_notes'),
    inspectedBy: uuid('inspected_by').references(() => users.id, { onDelete: 'set null' }),
    inspectedAt: tstz('inspected_at'),
    outcome: returnItemOutcome('outcome'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('return_items_request_garment_uq').on(t.returnRequestId, t.garmentId),
    index('return_items_garment_idx').on(t.garmentId),
    check(
      'return_items_outcome_requires_inspection',
      sql`${t.outcome} IS NULL OR (${t.inspectedCondition} IS NOT NULL AND ${t.inspectedAt} IS NOT NULL)`,
    ),
  ],
);

/** Inspection and evidence photos, held as object-storage references. */
export const returnItemMedia = pgTable(
  'return_item_media',
  {
    returnItemId: uuid('return_item_id')
      .notNull()
      .references(() => returnItems.id, { onDelete: 'cascade' }),
    mediaAssetId: uuid('media_asset_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'restrict' }),
  },
  (t) => [primaryKey({ columns: [t.returnItemId, t.mediaAssetId] })],
);

export const exchanges = pgTable(
  'exchanges',
  {
    id: id(),
    exchangeNumber: text('exchange_number').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    returnRequestId: uuid('return_request_id').references(() => returnRequests.id, { onDelete: 'restrict' }),
    /**
     * The subscription whose swap allowance this exchange uses (found from the returned garments). Null for an
     * exchange of garments that were bought, which no allowance limits.
     */
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id, { onDelete: 'restrict' }),
    status: exchangeStatus('status').notNull().default('REQUESTED'),
    /** The order that ships the replacement garments. */
    replacementOrderId: uuid('replacement_order_id').references(() => orders.id, { onDelete: 'restrict' }),
    decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: tstz('decided_at'),
    completedAt: tstz('completed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('exchanges_number_uq').on(t.exchangeNumber),
    uniqueIndex('exchanges_replacement_order_uq').on(t.replacementOrderId),
    index('exchanges_user_idx').on(t.userId, t.createdAt),
    index('exchanges_status_idx').on(t.status),
    // Counting the swaps used in a billing period.
    index('exchanges_subscription_idx').on(t.subscriptionId, t.createdAt),
  ],
);

export const exchangeItems = pgTable(
  'exchange_items',
  {
    id: id(),
    exchangeId: uuid('exchange_id')
      .notNull()
      .references(() => exchanges.id, { onDelete: 'cascade' }),
    returnItemId: uuid('return_item_id').references(() => returnItems.id, { onDelete: 'restrict' }),
    /** The next size (or alternative) the customer chose. */
    requestedVariantId: uuid('requested_variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),
    replacementGarmentId: uuid('replacement_garment_id').references(() => garments.id, {
      onDelete: 'restrict',
    }),
    createdAt: createdAt(),
  },
  (t) => [
    index('exchange_items_exchange_idx').on(t.exchangeId),
    uniqueIndex('exchange_items_return_item_uq').on(t.returnItemId),
  ],
);

/**
 * Exchange credit ledger (append-only). Positive entries add credit, negative entries
 * spend or expire it; a customer's balance is the sum of their entries. Nothing is ever
 * edited, so every change to a balance has an explanation.
 */
export const exchangeCredits = pgTable(
  'exchange_credits',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    entryType: exchangeCreditEntryType('entry_type').notNull(),
    /** Signed minor units. */
    amount: amount('amount').notNull(),
    currency: currency(),
    returnItemId: uuid('return_item_id').references(() => returnItems.id, { onDelete: 'restrict' }),
    exchangeId: uuid('exchange_id').references(() => exchanges.id, { onDelete: 'restrict' }),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'restrict' }),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'restrict' }),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [
    index('exchange_credits_user_idx').on(t.userId, t.createdAt),
    // A returned garment can earn credit only once.
    uniqueIndex('exchange_credits_one_earning_per_return_item_uq')
      .on(t.returnItemId)
      .where(sql`${t.entryType} = 'EARNED'`),
    // Credit can be spent on an order only once.
    uniqueIndex('exchange_credits_one_redemption_per_order_uq')
      .on(t.orderId)
      .where(sql`${t.entryType} = 'REDEEMED'`),
    check(
      'exchange_credits_sign_matches_type',
      sql`(${t.entryType} = 'EARNED' AND ${t.amount} > 0)
        OR (${t.entryType} IN ('REDEEMED', 'EXPIRED') AND ${t.amount} < 0)
        OR (${t.entryType} = 'ADJUSTMENT' AND ${t.amount} <> 0)`,
    ),
  ],
);
