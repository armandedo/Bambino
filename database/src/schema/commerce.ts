import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { productVariants } from './catalogue';
import { amount, createdAt, currency, id, tstz, updatedAt } from './columns';
import {
  cartStatus,
  discountType,
  orderStatus,
  orderType,
  promotionScope,
  subscriptionItemStatus,
} from './enums';
import { garments } from './garments';
import { addresses, users } from './identity';
import { subscriptions } from './subscriptions';

/** Address as it was when the order was placed; later edits to the address book do not alter it. */
export interface AddressSnapshot {
  recipientName: string;
  phone: string;
  countryCode: string;
  region: string | null;
  district: string | null;
  sector: string | null;
  street: string | null;
  directions: string | null;
}

export const carts = pgTable(
  'carts',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: cartStatus('status').notNull().default('ACTIVE'),
    currency: currency(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('carts_one_active_per_user_uq')
      .on(t.userId)
      .where(sql`${t.status} = 'ACTIVE'`),
  ],
);

/** Holds no price: totals are always recomputed from current variant prices on the server. */
export const cartItems = pgTable(
  'cart_items',
  {
    id: id(),
    cartId: uuid('cart_id')
      .notNull()
      .references(() => carts.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('cart_items_cart_variant_uq').on(t.cartId, t.variantId),
    check('cart_items_quantity_positive', sql`${t.quantity} > 0`),
  ],
);

/** Configurable delivery choices and fees, so shipping cost is looked up server-side. */
export const deliveryOptions = pgTable(
  'delivery_options',
  {
    id: id(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    marketCode: text('market_code').notNull(),
    feeAmount: amount('fee_amount').notNull(),
    currency: currency(),
    estimatedDaysMin: integer('estimated_days_min').notNull(),
    estimatedDaysMax: integer('estimated_days_max').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('delivery_options_market_code_uq').on(t.marketCode, t.code),
    check('delivery_options_fee_non_negative', sql`${t.feeAmount} >= 0`),
    check(
      'delivery_options_days_valid',
      sql`${t.estimatedDaysMin} >= 0 AND ${t.estimatedDaysMax} >= ${t.estimatedDaysMin}`,
    ),
  ],
);

/** The rule: a campaign or coupon code. `discounts` records each time it is applied. */
export const promotions = pgTable(
  'promotions',
  {
    id: id(),
    /** Null for promotions applied automatically rather than by entering a code. */
    code: text('code'),
    name: text('name').notNull(),
    scope: promotionScope('scope').notNull(),
    discountType: discountType('discount_type').notNull(),
    /** For PERCENTAGE: 1000 = 10%. */
    percentBasisPoints: integer('percent_basis_points'),
    /** For FIXED_AMOUNT. */
    fixedAmount: amount('fixed_amount'),
    currency: currency(),
    minSubtotalAmount: amount('min_subtotal_amount').notNull().default(0),
    maxRedemptions: integer('max_redemptions'),
    maxRedemptionsPerUser: integer('max_redemptions_per_user').notNull().default(1),
    startsAt: tstz('starts_at').notNull(),
    endsAt: tstz('ends_at'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('promotions_code_upper_uq').on(sql`upper(${t.code})`),
    check(
      'promotions_value_matches_type',
      sql`(${t.discountType} = 'PERCENTAGE' AND ${t.percentBasisPoints} BETWEEN 1 AND 10000 AND ${t.fixedAmount} IS NULL)
        OR (${t.discountType} = 'FIXED_AMOUNT' AND ${t.fixedAmount} > 0 AND ${t.percentBasisPoints} IS NULL)
        OR (${t.discountType} = 'FREE_SHIPPING' AND ${t.fixedAmount} IS NULL AND ${t.percentBasisPoints} IS NULL)`,
    ),
    check('promotions_window_valid', sql`${t.endsAt} IS NULL OR ${t.endsAt} > ${t.startsAt}`),
  ],
);

export const orders = pgTable(
  'orders',
  {
    id: id(),
    /** Customer-facing reference, e.g. BMB-2026-000123. */
    orderNumber: text('order_number').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    type: orderType('type').notNull(),
    status: orderStatus('status').notNull().default('PENDING_PAYMENT'),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id, { onDelete: 'restrict' }),
    currency: currency(),
    subtotalAmount: amount('subtotal_amount').notNull(),
    discountAmount: amount('discount_amount').notNull().default(0),
    creditAppliedAmount: amount('credit_applied_amount').notNull().default(0),
    shippingAmount: amount('shipping_amount').notNull().default(0),
    taxAmount: amount('tax_amount').notNull().default(0),
    totalAmount: amount('total_amount').notNull(),
    shippingAddressId: uuid('shipping_address_id').references(() => addresses.id, { onDelete: 'set null' }),
    shippingAddress: jsonb('shipping_address').$type<AddressSnapshot>().notNull(),
    deliveryOptionCode: text('delivery_option_code').notNull(),
    /** Client-generated key: retrying the same checkout returns this order instead of a duplicate. */
    idempotencyKey: text('idempotency_key').notNull(),
    placedAt: tstz('placed_at').notNull().defaultNow(),
    paidAt: tstz('paid_at'),
    cancelledAt: tstz('cancelled_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('orders_order_number_uq').on(t.orderNumber),
    uniqueIndex('orders_user_idempotency_uq').on(t.userId, t.idempotencyKey),
    index('orders_user_placed_idx').on(t.userId, t.placedAt),
    index('orders_status_idx').on(t.status),
    index('orders_subscription_idx').on(t.subscriptionId),
    check(
      'orders_amounts_non_negative',
      sql`${t.subtotalAmount} >= 0 AND ${t.discountAmount} >= 0 AND ${t.creditAppliedAmount} >= 0
        AND ${t.shippingAmount} >= 0 AND ${t.taxAmount} >= 0 AND ${t.totalAmount} >= 0`,
    ),
    check(
      'orders_total_is_consistent',
      sql`${t.totalAmount} = ${t.subtotalAmount} - ${t.discountAmount} - ${t.creditAppliedAmount} + ${t.shippingAmount} + ${t.taxAmount}`,
    ),
    check(
      'orders_subscription_matches_type',
      sql`(${t.type} = 'SUBSCRIPTION_CYCLE') = (${t.subscriptionId} IS NOT NULL)`,
    ),
  ],
);

/** Name, SKU, size and price are copied in so an order always shows what was actually bought. */
export const orderItems = pgTable(
  'order_items',
  {
    id: id(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),
    /** Set when a specific circulating garment fulfils this line (always quantity 1). */
    garmentId: uuid('garment_id').references(() => garments.id, { onDelete: 'restrict' }),
    productName: text('product_name').notNull(),
    sku: text('sku').notNull(),
    sizeCode: text('size_code').notNull(),
    color: text('color').notNull(),
    unitPriceAmount: amount('unit_price_amount').notNull(),
    quantity: integer('quantity').notNull(),
    lineTotalAmount: amount('line_total_amount').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('order_items_order_idx').on(t.orderId),
    index('order_items_garment_idx').on(t.garmentId),
    check('order_items_quantity_positive', sql`${t.quantity} > 0`),
    check(
      'order_items_line_total_is_consistent',
      sql`${t.lineTotalAmount} = ${t.unitPriceAmount} * ${t.quantity}`,
    ),
    check('order_items_garment_is_single_unit', sql`${t.garmentId} IS NULL OR ${t.quantity} = 1`),
  ],
);

export const orderStatusEvents = pgTable(
  'order_status_events',
  {
    id: id(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    previousStatus: orderStatus('previous_status'),
    newStatus: orderStatus('new_status').notNull(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    note: text('note'),
    createdAt: createdAt(),
    /** Total order of events, even when timestamps are equal. */
    sequence: bigint('sequence', { mode: 'number' }).generatedAlwaysAsIdentity(),
  },
  (t) => [index('order_status_events_order_idx').on(t.orderId, t.createdAt)],
);

/**
 * One row each time a promotion is applied. Redemption limits are enforced by counting
 * these rows inside the checkout transaction, so a coupon cannot be replayed.
 */
export const discounts = pgTable(
  'discounts',
  {
    id: id(),
    promotionId: uuid('promotion_id')
      .notNull()
      .references(() => promotions.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id, { onDelete: 'cascade' }),
    amount: amount('amount').notNull(),
    currency: currency(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('discounts_promotion_order_uq').on(t.promotionId, t.orderId),
    index('discounts_promotion_user_idx').on(t.promotionId, t.userId),
    check('discounts_amount_non_negative', sql`${t.amount} >= 0`),
    check('discounts_has_target', sql`${t.orderId} IS NOT NULL OR ${t.subscriptionId} IS NOT NULL`),
  ],
);

/** What a subscriber receives in a given billing cycle, and which physical garment fulfilled it. */
export const subscriptionItems = pgTable(
  'subscription_items',
  {
    id: id(),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'restrict' }),
    cycleNumber: integer('cycle_number').notNull(),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),
    garmentId: uuid('garment_id').references(() => garments.id, { onDelete: 'restrict' }),
    orderItemId: uuid('order_item_id').references(() => orderItems.id, { onDelete: 'set null' }),
    status: subscriptionItemStatus('status').notNull().default('SELECTED'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('subscription_items_subscription_cycle_idx').on(t.subscriptionId, t.cycleNumber),
    index('subscription_items_garment_idx').on(t.garmentId),
    check('subscription_items_cycle_positive', sql`${t.cycleNumber} > 0`),
  ],
);
