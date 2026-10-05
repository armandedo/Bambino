import { sql } from 'drizzle-orm';
import { boolean, check, index, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { amount, createdAt, currency, id, tstz, updatedAt } from './columns';
import {
  idempotencyStatus,
  paymentProvider,
  paymentStatus,
  paymentTransactionType,
  refundMethod,
  refundStatus,
} from './enums';
import { orders } from './commerce';
import { users } from './identity';
import { subscriptions } from './subscriptions';

/** One attempt to collect money for an order or a subscription period. */
export const payments = pgTable(
  'payments',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'restrict' }),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id, { onDelete: 'restrict' }),
    provider: paymentProvider('provider').notNull(),
    status: paymentStatus('status').notNull().default('INITIATED'),
    amount: amount('amount').notNull(),
    currency: currency(),
    /** Sent to the provider as its request reference, so a retried initiation cannot double-charge. */
    idempotencyKey: text('idempotency_key').notNull(),
    providerReference: text('provider_reference'),
    payerMsisdn: text('payer_msisdn'),
    failureCode: text('failure_code'),
    failureMessage: text('failure_message'),
    initiatedAt: tstz('initiated_at').notNull().defaultNow(),
    expiresAt: tstz('expires_at'),
    completedAt: tstz('completed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('payments_idempotency_key_uq').on(t.idempotencyKey),
    uniqueIndex('payments_provider_reference_uq').on(t.provider, t.providerReference),
    index('payments_order_idx').on(t.orderId),
    index('payments_subscription_idx').on(t.subscriptionId),
    index('payments_user_idx').on(t.userId),
    // Drives reconciliation: "which payments are still unresolved?"
    index('payments_unresolved_idx')
      .on(t.initiatedAt)
      .where(sql`${t.status} IN ('INITIATED', 'PENDING')`),
    // At most one successful payment per order: the database itself refuses a double charge.
    uniqueIndex('payments_one_success_per_order_uq')
      .on(t.orderId)
      .where(sql`${t.status} = 'SUCCEEDED'`),
    check('payments_amount_positive', sql`${t.amount} > 0`),
    check('payments_has_target', sql`${t.orderId} IS NOT NULL OR ${t.subscriptionId} IS NOT NULL`),
  ],
);

/**
 * Append-only log of every interaction about a payment: our initiation call, each
 * status poll, each webhook, reconciliation results and manual adjustments.
 */
export const paymentTransactions = pgTable(
  'payment_transactions',
  {
    id: id(),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id, { onDelete: 'restrict' }),
    type: paymentTransactionType('type').notNull(),
    /** Payment status after this transaction was applied. */
    resultingStatus: paymentStatus('resulting_status').notNull(),
    amount: amount('amount').notNull(),
    currency: currency(),
    providerReference: text('provider_reference'),
    /** Provider payload with credentials and full wallet numbers removed. */
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'restrict' }),
    createdAt: createdAt(),
  },
  (t) => [index('payment_transactions_payment_idx').on(t.paymentId, t.createdAt)],
);

/**
 * Money given back for a successful payment, in full or in part. Starts REQUESTED and needs staff approval
 * (REFUND_POLICY). The refund service keeps the total of open and succeeded refunds within the payment amount.
 */
export const refunds = pgTable(
  'refunds',
  {
    id: id(),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id, { onDelete: 'restrict' }),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    method: refundMethod('method').notNull(),
    status: refundStatus('status').notNull().default('REQUESTED'),
    amount: amount('amount').notNull(),
    currency: currency(),
    /** Staff-facing reason. Not shown to the customer. */
    reason: text('reason').notNull(),
    /** Sent to the provider as its request reference, so a retried refund cannot pay out twice. */
    idempotencyKey: text('idempotency_key').notNull(),
    providerReference: text('provider_reference'),
    failureCode: text('failure_code'),
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'restrict' }),
    decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'restrict' }),
    decidedAt: tstz('decided_at'),
    completedAt: tstz('completed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('refunds_idempotency_key_uq').on(t.idempotencyKey),
    uniqueIndex('refunds_provider_reference_uq').on(t.providerReference),
    index('refunds_payment_idx').on(t.paymentId),
    index('refunds_order_idx').on(t.orderId),
    // Drives reconciliation: "which refunds is the provider still working on?"
    index('refunds_processing_idx')
      .on(t.updatedAt)
      .where(sql`${t.status} = 'PROCESSING'`),
    check('refunds_amount_positive', sql`${t.amount} > 0`),
  ],
);

/** Every webhook delivery, stored before processing. The unique key makes replays a no-op. */
export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: id(),
    provider: paymentProvider('provider').notNull(),
    providerEventId: text('provider_event_id').notNull(),
    signatureValid: boolean('signature_valid').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    receivedAt: tstz('received_at').notNull().defaultNow(),
    processedAt: tstz('processed_at'),
    processingError: text('processing_error'),
  },
  (t) => [
    uniqueIndex('webhook_events_provider_event_uq').on(t.provider, t.providerEventId),
    index('webhook_events_unprocessed_idx')
      .on(t.receivedAt)
      .where(sql`${t.processedAt} IS NULL`),
  ],
);

/**
 * Generic idempotency store for money-moving mutations. A repeated key with the same
 * request hash returns the stored result; with a different hash it is rejected.
 */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    scope: text('scope').notNull(),
    key: text('key').notNull(),
    requestHash: text('request_hash').notNull(),
    status: idempotencyStatus('status').notNull().default('IN_PROGRESS'),
    resourceType: text('resource_type'),
    resourceId: uuid('resource_id'),
    createdAt: createdAt(),
    expiresAt: tstz('expires_at').notNull(),
  },
  (t) => [uniqueIndex('idempotency_keys_user_scope_key_uq').on(t.userId, t.scope, t.key)],
);
