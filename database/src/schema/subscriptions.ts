import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { babyProfiles } from './baby';
import { categories } from './catalogue';
import { amount, createdAt, currency, deletedAt, id, tstz, updatedAt } from './columns';
import { billingInterval, paymentProvider, subscriptionEventType, subscriptionStatus } from './enums';
import { addresses, users } from './identity';

export interface ExchangePolicy {
  /** How many garments may be exchanged per billing cycle; null means unlimited. */
  exchangesPerCycle: number | null;
}

/** Plans are data: admins create and price them, nothing is hard-coded in application code. */
export const subscriptionPlans = pgTable(
  'subscription_plans',
  {
    id: id(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    marketCode: text('market_code').notNull(),
    billingInterval: billingInterval('billing_interval').notNull(),
    priceAmount: amount('price_amount').notNull(),
    currency: currency(),
    itemsPerCycle: integer('items_per_cycle').notNull(),
    exchangePolicy: jsonb('exchange_policy').$type<ExchangePolicy>().notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('subscription_plans_code_uq').on(t.code),
    check('subscription_plans_price_non_negative', sql`${t.priceAmount} >= 0`),
    check('subscription_plans_items_positive', sql`${t.itemsPerCycle} > 0`),
  ],
);

/** allowedCategories. A plan with no rows here allows every subscription-eligible category. */
export const subscriptionPlanCategories = pgTable(
  'subscription_plan_categories',
  {
    planId: uuid('plan_id')
      .notNull()
      .references(() => subscriptionPlans.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.planId, t.categoryId] })],
);

/**
 * A saved way to pay. For mobile money this is only the wallet number: no secret
 * or token is held, and each charge still needs the customer's approval on their phone.
 */
export const paymentMethods = pgTable(
  'payment_methods',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: paymentProvider('provider').notNull(),
    /** Wallet number in E.164 for mobile money. */
    msisdn: text('msisdn'),
    label: text('label'),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index('payment_methods_user_idx').on(t.userId),
    uniqueIndex('payment_methods_one_default_per_user_uq')
      .on(t.userId)
      .where(sql`${t.isDefault} AND ${t.deletedAt} IS NULL`),
  ],
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    babyProfileId: uuid('baby_profile_id')
      .notNull()
      .references(() => babyProfiles.id, { onDelete: 'restrict' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => subscriptionPlans.id, { onDelete: 'restrict' }),
    status: subscriptionStatus('status').notNull().default('PENDING'),
    /** Price agreed at subscribe/renewal time, so later plan price edits do not rewrite history. */
    priceAmount: amount('price_amount').notNull(),
    currency: currency(),
    shippingAddressId: uuid('shipping_address_id').references(() => addresses.id, { onDelete: 'set null' }),
    paymentMethodId: uuid('payment_method_id').references(() => paymentMethods.id, { onDelete: 'set null' }),
    currentPeriodStart: tstz('current_period_start'),
    currentPeriodEnd: tstz('current_period_end'),
    nextBillingAt: tstz('next_billing_at'),
    /** Downgrades take effect at the next renewal; upgrades apply immediately. */
    pendingPlanId: uuid('pending_plan_id').references(() => subscriptionPlans.id, { onDelete: 'set null' }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    renewalAttempts: integer('renewal_attempts').notNull().default(0),
    startedAt: tstz('started_at'),
    pausedAt: tstz('paused_at'),
    resumeAt: tstz('resume_at'),
    cancelledAt: tstz('cancelled_at'),
    cancellationReason: text('cancellation_reason'),
    endedAt: tstz('ended_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('subscriptions_user_idx').on(t.userId),
    index('subscriptions_status_idx').on(t.status),
    // Drives the renewal job: "which live subscriptions are due?"
    index('subscriptions_due_idx')
      .on(t.nextBillingAt)
      .where(sql`${t.status} IN ('ACTIVE', 'PAST_DUE')`),
    // One live subscription per baby.
    uniqueIndex('subscriptions_one_live_per_baby_uq')
      .on(t.babyProfileId)
      .where(sql`${t.status} IN ('PENDING', 'ACTIVE', 'PAUSED', 'PAST_DUE')`),
    check('subscriptions_price_non_negative', sql`${t.priceAmount} >= 0`),
  ],
);

/** Subscription history: append-only record of every lifecycle change. */
export const subscriptionEvents = pgTable(
  'subscription_events',
  {
    id: id(),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'restrict' }),
    eventType: subscriptionEventType('event_type').notNull(),
    previousStatus: subscriptionStatus('previous_status'),
    newStatus: subscriptionStatus('new_status').notNull(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'restrict' }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    /** Total order of events, even when timestamps are equal. */
    sequence: bigint('sequence', { mode: 'number' }).generatedAlwaysAsIdentity(),
  },
  (t) => [index('subscription_events_subscription_idx').on(t.subscriptionId, t.createdAt)],
);
