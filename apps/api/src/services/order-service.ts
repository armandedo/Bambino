import { getMarket, REFUND_POLICY } from '@bambino/config';
import { type AddressSnapshot, type Database, type Executor, schema } from '@bambino/database';
import { and, asc, desc, eq, ilike, inArray, isNull, lt, or, sql } from '@bambino/database/orm';
import type { OrderStatus, OrderType, PaymentProviderCode } from '@bambino/types';
import { type CurrencyCode, type Money, money, zero } from '@bambino/utils';
import { phoneSchema } from '@bambino/validation';
import { z } from 'zod';
import { payOnDeliveryAvailability } from '../domain/pay-on-delivery';
import { orderLifecycle } from '../domain/lifecycles';
import {
  type OrderTotals,
  type PromotionRejection,
  calculateTotals,
  evaluatePromotion,
} from '../domain/pricing';
import { generateReference } from '../domain/references';
import { recordAudit } from './audit-service';
import type { CartLine, CartService } from './cart-service';
import { type ServiceContext, requirePermission, requireUser } from './context';
import type { CreditLedger } from './credit-ledger';
import type { DeliveryService } from './delivery-service';
import { AppError, isUniqueViolation, parseInput } from './errors';
import type { InventoryService } from './inventory-service';
import type { NotificationService } from './notification-service';
import {
  type Page,
  type PageRequest,
  decodeKeyset,
  decodeOffset,
  encodeKeyset,
  encodeOffset,
  pageSize,
  toPage,
} from './pagination';
import type { PromotionRow, PromotionService } from './promotion-service';

export type OrderRow = typeof schema.orders.$inferSelect;
export type OrderItemRow = typeof schema.orderItems.$inferSelect;
export type OrderStatusEventRow = typeof schema.orderStatusEvents.$inferSelect;

/** Unpaid orders hold stock; after this long without a payment in progress they are cancelled. */
export const UNPAID_ORDER_TTL_HOURS = 24;

const checkoutSchema = z.object({
  shippingAddressId: z.uuid(),
  deliveryOptionCode: z.string().trim().min(1).max(40),
  promotionCode: z.string().trim().max(30).nullish(),
  applyExchangeCredit: z.boolean().nullish(),
});
type CheckoutInput = z.infer<typeof checkoutSchema>;

/** The wallet to ask for payment when the order arrives. There is no cash: only mobile money is accepted at the door. */
const confirmPayOnDeliverySchema = z.object({
  orderId: z.uuid(),
  provider: z.enum(['MTN_MOMO', 'AIRTEL_MONEY', 'MOCK']),
  msisdn: phoneSchema,
});

const createOrderSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(100),
  checkout: checkoutSchema,
});

/** Statuses staff may set by hand. PAID comes only from a confirmed payment; returns from the returns flow. */
const STAFF_SETTABLE: readonly OrderStatus[] = ['PROCESSING', 'PACKED', 'READY_FOR_DISPATCH', 'CANCELLED'];

const PROMOTION_MESSAGES: Record<PromotionRejection | 'UNKNOWN', string> = {
  UNKNOWN: 'This promotion code does not exist.',
  INACTIVE: 'This promotion is not active.',
  NOT_STARTED: 'This promotion has not started yet.',
  ENDED: 'This promotion has ended.',
  WRONG_SCOPE: 'This promotion does not apply to this kind of purchase.',
  WRONG_CURRENCY: 'This promotion does not apply in this market.',
  BELOW_MINIMUM: 'Your order is below the minimum for this promotion.',
  EXHAUSTED: 'This promotion has been fully used.',
  ALREADY_USED: 'You have already used this promotion.',
};

interface Quote {
  cartId: string;
  lines: CartLine[];
  address: AddressSnapshot & { id: string };
  deliveryOptionCode: string;
  promotion: PromotionRow | null;
  promotionRejection: PromotionRejection | 'UNKNOWN' | null;
  availableCredit: Money;
  totals: OrderTotals;
}

export interface OrderServiceDependencies {
  db: Database;
  cart: CartService;
  inventory: InventoryService;
  promotions: PromotionService;
  credit: CreditLedger;
  delivery: DeliveryService;
  notifications: NotificationService;
  marketCode: string;
  currency: CurrencyCode;
  now: () => Date;
  /** Mobile-money providers that are offered here and really integrated; decides whether pay on delivery exists. */
  doorProviders: () => PaymentProviderCode[];
}

/** Checkout, orders and their status, apart from payment (PaymentService) and shipping (DeliveryService). */
/** Reaction to an order event, run inside the same transaction. */
export type OrderHook = (tx: Executor, order: OrderRow) => Promise<void>;

export class OrderService {
  private readonly hooks: Record<'paid' | 'delivered' | 'cancelled', OrderHook[]> = {
    paid: [],
    delivered: [],
    cancelled: [],
  };

  /** Requests the refund when a paid order is cancelled (RefundService; attached after construction). */
  private refunds: {
    requestForCancelledOrder(
      tx: Executor,
      order: OrderRow,
      requestedBy: string,
      reason: string,
    ): Promise<unknown>;
  } | null = null;

  constructor(private readonly deps: OrderServiceDependencies) {}

  attachRefunds(refunds: NonNullable<OrderService['refunds']>): void {
    this.refunds = refunds;
  }

  /** Lets subscriptions, exchanges and garments react to orders without the order service knowing them. */
  on(event: 'paid' | 'delivered' | 'cancelled', hook: OrderHook): void {
    this.hooks[event].push(hook);
  }

  async runDeliveredHooks(tx: Executor, order: OrderRow): Promise<void> {
    for (const hook of this.hooks.delivered) await hook(tx, order);
  }

  async preview(context: ServiceContext, rawInput: unknown) {
    const actor = requireUser(context);
    const input = parseInput(checkoutSchema, rawInput);
    const quote = await this.quote(this.deps.db, actor.userId, input, false);
    return {
      totals: quote.totals,
      promotionError: quote.promotionRejection ? PROMOTION_MESSAGES[quote.promotionRejection] : null,
      availableCredit: quote.availableCredit,
      // The cart's own total decides it; the same rule is enforced again when the order is confirmed.
      payOnDelivery: this.payOnDeliveryOption({ type: 'ONE_TIME', totalAmount: quote.totals.total.amount }),
    };
  }

  /**
   * Turns the cart into an order awaiting payment, reserving stock. Every amount is computed
   * here from database prices. Re-sending the same idempotency key returns the first order.
   */
  async createOrder(context: ServiceContext, rawInput: unknown): Promise<OrderRow> {
    const actor = requireUser(context);
    const input = parseInput(createOrderSchema, rawInput);
    const { db } = this.deps;

    const existing = await this.findByIdempotencyKey(db, actor.userId, input.idempotencyKey);
    if (existing) return existing;

    try {
      return await db.transaction(async (tx) => {
        await this.lockCustomer(tx, actor.userId);
        const again = await this.findByIdempotencyKey(tx, actor.userId, input.idempotencyKey);
        if (again) return again;

        const quote = await this.quote(tx, actor.userId, input.checkout, true);
        if (quote.promotionRejection) {
          throw new AppError(
            'VALIDATION_FAILED',
            PROMOTION_MESSAGES[quote.promotionRejection],
            `PROMOTION_${quote.promotionRejection}`,
          );
        }
        const { totals } = quote;
        const { id: addressId, ...shippingAddress } = quote.address;
        const order = await this.insertWithUniqueNumber(tx, {
          userId: actor.userId,
          type: 'ONE_TIME',
          status: 'PENDING_PAYMENT',
          currency: totals.total.currency,
          subtotalAmount: totals.subtotal.amount,
          discountAmount: totals.discount.amount,
          creditAppliedAmount: totals.creditApplied.amount,
          shippingAmount: totals.shipping.amount,
          taxAmount: totals.tax.amount,
          totalAmount: totals.total.amount,
          shippingAddressId: addressId,
          shippingAddress,
          deliveryOptionCode: quote.deliveryOptionCode,
          idempotencyKey: input.idempotencyKey,
          placedAt: this.deps.now(),
        });

        const variants = await tx
          .select({ variant: schema.productVariants, productName: schema.products.name })
          .from(schema.productVariants)
          .innerJoin(schema.products, eq(schema.products.id, schema.productVariants.productId))
          .where(
            inArray(
              schema.productVariants.id,
              quote.lines.map((line) => line.variantId),
            ),
          );
        const byId = new Map(variants.map((row) => [row.variant.id, row]));
        for (const line of quote.lines) {
          const row = byId.get(line.variantId);
          if (!row)
            throw new AppError(
              'CONFLICT',
              'An item in your cart is no longer available.',
              'ITEM_UNAVAILABLE',
            );
          await this.deps.inventory.reserve(tx, line.variantId, line.quantity, {
            type: 'order',
            id: order.id,
          });
          await tx.insert(schema.orderItems).values({
            orderId: order.id,
            variantId: line.variantId,
            productName: row.productName,
            sku: row.variant.sku,
            sizeCode: row.variant.sizeCode,
            color: row.variant.color,
            unitPriceAmount: line.unitPrice.amount,
            quantity: line.quantity,
            lineTotalAmount: line.lineTotal.amount,
          });
        }

        await tx
          .insert(schema.orderStatusEvents)
          .values({ orderId: order.id, newStatus: 'PENDING_PAYMENT', actorId: actor.userId });
        if (quote.promotion && totals.discount.amount > 0) {
          await this.deps.promotions.redeem(tx, {
            promotionId: quote.promotion.id,
            userId: actor.userId,
            orderId: order.id,
            amount: totals.discount.amount,
            currency: totals.discount.currency,
          });
        }
        if (totals.creditApplied.amount > 0) {
          await this.deps.credit.redeemForOrder(tx, actor.userId, order.id, totals.creditApplied);
        }
        await tx.update(schema.carts).set({ status: 'CONVERTED' }).where(eq(schema.carts.id, quote.cartId));
        await tx.insert(schema.analyticsEvents).values({
          eventName: 'ORDER_CREATED',
          userId: actor.userId,
          properties: { orderId: order.id, itemCount: quote.lines.length, total: totals.total.amount },
          occurredAt: this.deps.now(),
        });

        // Fully covered by credit: nothing to collect.
        if (totals.total.amount === 0) return this.markPaid(tx, order, actor.userId);
        return order;
      });
    } catch (error) {
      if (isUniqueViolation(error, 'orders_user_idempotency_uq')) {
        const winner = await this.findByIdempotencyKey(db, actor.userId, input.idempotencyKey);
        if (winner) return winner;
      }
      throw error;
    }
  }

  /**
   * Pay on delivery, by mobile money. The customer picks the wallet (provider and number) now; the order is
   * confirmed, stock committed and the delivery created, but nothing is charged yet. When the order is out for
   * delivery, staff ask the wallet for payment at the door (PaymentService.requestAtDoor) and the customer approves
   * it with their PIN. The delivery cannot be completed until that payment succeeded. There is no cash.
   * Repeating the request returns the confirmed order.
   */
  async confirmPayOnDelivery(context: ServiceContext, rawInput: unknown): Promise<OrderRow> {
    const actor = requireUser(context);
    const input = parseInput(confirmPayOnDeliverySchema, rawInput);
    return this.deps.db.transaction(async (tx) => {
      const order = await this.lockOwnOrder(tx, actor.userId, input.orderId);
      if (order.status === 'CONFIRMED' && order.payOnDeliveryProvider) return order;
      if (order.status !== 'PENDING_PAYMENT') {
        throw new AppError('CONFLICT', 'This order does not need a payment.', 'ORDER_NOT_PAYABLE');
      }
      const option = this.payOnDeliveryOption(order);
      if (!option.available) {
        throw new AppError(
          'VALIDATION_FAILED',
          option.message ?? 'Pay on delivery is not available.',
          'PAY_ON_DELIVERY_UNAVAILABLE',
        );
      }
      if (!option.providers.includes(input.provider)) {
        throw new AppError(
          'VALIDATION_FAILED',
          'This payment method is not available.',
          'PROVIDER_NOT_OFFERED',
        );
      }
      await this.assertNoPaymentInProgress(tx, order.id);

      const updated = await this.transition(tx, order, 'CONFIRMED', actor.userId, 'Pay on delivery', {
        payOnDeliveryProvider: input.provider,
        payOnDeliveryMsisdn: input.msisdn,
      });
      await this.commitStock(tx, order.id);
      await this.deps.delivery.createForOrder(tx, updated);
      await this.deps.notifications.notify(tx, order.userId, 'ORDER_CONFIRMED', {
        orderNumber: order.orderNumber,
      });
      await tx.insert(schema.analyticsEvents).values({
        eventName: 'ORDER_CONFIRMED_PAY_ON_DELIVERY',
        userId: actor.userId,
        properties: { orderId: order.id, total: order.totalAmount, provider: input.provider },
        occurredAt: this.deps.now(),
      });
      return updated;
    });
  }

  /**
   * Whether pay on delivery is open for an order of this type and total, and with which wallets. It needs at least
   * one real mobile-money provider: without one there would be no way to collect at the door.
   */
  payOnDeliveryOption(order: { type: OrderType; totalAmount: number }) {
    const rule = payOnDeliveryAvailability(order);
    const providers = this.deps.doorProviders();
    if (rule.available && providers.length === 0) {
      return {
        available: false as const,
        message: 'Pay on delivery needs a mobile-money method, which is not available yet.',
        providers,
      };
    }
    return rule.available
      ? { available: true as const, message: null, providers }
      : { available: false as const, message: rule.message, providers };
  }

  /**
   * Customers can cancel before paying (not while a payment prompt is open), or after paying while REFUND_POLICY
   * allows it, in which case a full refund is requested for staff to approve.
   */
  async cancelOrder(context: ServiceContext, rawOrderId: unknown): Promise<OrderRow> {
    const actor = requireUser(context);
    const orderId = parseInput(z.uuid(), rawOrderId);
    return this.deps.db.transaction(async (tx) => {
      const order = await this.lockOwnOrder(tx, actor.userId, orderId);
      if (order.status === 'PENDING_PAYMENT') {
        return this.cancelUnpaid(tx, order, actor.userId, 'Cancelled by customer');
      }
      return this.cancelPaid(
        tx,
        order,
        actor.userId,
        'Cancelled by customer',
        REFUND_POLICY.customerCancellableStatuses,
      );
    });
  }

  async applyExchangeCredit(context: ServiceContext, rawOrderId: unknown): Promise<OrderRow> {
    const actor = requireUser(context);
    const orderId = parseInput(z.uuid(), rawOrderId);
    return this.deps.db.transaction(async (tx) => {
      await this.lockCustomer(tx, actor.userId);
      const order = await this.lockOwnOrder(tx, actor.userId, orderId);
      if (order.status !== 'PENDING_PAYMENT') {
        throw new AppError('CONFLICT', 'Credit can only be applied before payment.', 'ORDER_NOT_PAYABLE');
      }
      await this.assertNoPaymentInProgress(tx, order.id);
      if (order.creditAppliedAmount > 0)
        throw new AppError('CONFLICT', 'Credit is already applied to this order.', 'CREDIT_ALREADY_APPLIED');
      const balance = await this.deps.credit.balance(tx, actor.userId);
      const apply = Math.min(balance.amount, order.totalAmount);
      if (apply <= 0)
        throw new AppError('VALIDATION_FAILED', 'You have no exchange credit to apply.', 'NO_CREDIT');

      await this.deps.credit.redeemForOrder(tx, actor.userId, order.id, money(apply, this.deps.currency));
      const [updated] = await tx
        .update(schema.orders)
        .set({ creditAppliedAmount: apply, totalAmount: order.totalAmount - apply })
        .where(eq(schema.orders.id, order.id))
        .returning();
      if (!updated) throw new Error('Order vanished while applying credit');
      return updated.totalAmount === 0 ? this.markPaid(tx, updated, actor.userId) : updated;
    });
  }

  async listOwn(context: ServiceContext, request: PageRequest): Promise<Page<OrderRow>> {
    const actor = requireUser(context);
    const size = pageSize(request, 20);
    const cursor = decodeKeyset(request.after);
    const rows = await this.deps.db
      .select()
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.userId, actor.userId),
          cursor
            ? or(
                lt(schema.orders.placedAt, cursor.at),
                and(eq(schema.orders.placedAt, cursor.at), lt(schema.orders.id, cursor.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(schema.orders.placedAt), desc(schema.orders.id))
      .limit(size + 1);
    return toPage(rows, size, (row) => encodeKeyset(row.placedAt, row.id));
  }

  /** Another customer's order and a missing one are indistinguishable. */
  async getOwn(context: ServiceContext, rawOrderId: unknown): Promise<OrderRow | null> {
    const actor = requireUser(context);
    const parsed = z.uuid().safeParse(rawOrderId);
    if (!parsed.success) return null;
    const [order] = await this.deps.db
      .select()
      .from(schema.orders)
      .where(and(eq(schema.orders.id, parsed.data), eq(schema.orders.userId, actor.userId)));
    return order ?? null;
  }

  async itemsFor(orderIds: readonly string[]): Promise<OrderItemRow[]> {
    if (orderIds.length === 0) return [];
    return this.deps.db
      .select()
      .from(schema.orderItems)
      .where(inArray(schema.orderItems.orderId, [...orderIds]))
      .orderBy(asc(schema.orderItems.createdAt));
  }

  async statusEventsFor(orderIds: readonly string[]): Promise<OrderStatusEventRow[]> {
    if (orderIds.length === 0) return [];
    return this.deps.db
      .select()
      .from(schema.orderStatusEvents)
      .where(inArray(schema.orderStatusEvents.orderId, [...orderIds]))
      .orderBy(asc(schema.orderStatusEvents.sequence));
  }

  async getForStaff(context: ServiceContext, rawId: unknown): Promise<OrderRow | null> {
    requirePermission(context, 'order:read');
    const parsed = z.uuid().safeParse(rawId);
    if (!parsed.success) return null;
    const [row] = await this.byIds([parsed.data]);
    return row ?? null;
  }

  async byIds(ids: readonly string[]): Promise<OrderRow[]> {
    return ids.length
      ? this.deps.db
          .select()
          .from(schema.orders)
          .where(inArray(schema.orders.id, [...ids]))
      : [];
  }

  creditBalanceOf(userId: string): Promise<Money> {
    return this.deps.credit.balance(this.deps.db, userId);
  }

  // --- used by PaymentService and DeliveryService ------------------------------

  /** Marks an order paid and does everything that follows: stock committed, delivery created, customer told. */
  async markPaid(tx: Executor, order: OrderRow, actorId: string | null): Promise<OrderRow> {
    const updated = await this.transition(tx, order, 'PAID', actorId, null, { paidAt: this.deps.now() });
    await this.commitStock(tx, order.id);
    await this.deps.delivery.createForOrder(tx, updated);
    await this.deps.notifications.notify(tx, order.userId, 'ORDER_CONFIRMED', {
      orderNumber: order.orderNumber,
    });
    for (const hook of this.hooks.paid) await hook(tx, updated);
    return updated;
  }

  /** Takes an order's new stock off hand. Circulating garments are reserved individually, so they are skipped. */
  private async commitStock(tx: Executor, orderId: string): Promise<void> {
    const items = await tx.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
    for (const item of items.filter((line) => line.garmentId === null)) {
      await this.deps.inventory.commitSale(tx, item.variantId, item.quantity, {
        type: 'order',
        id: orderId,
      });
    }
  }

  /**
   * A cancelled order's waiting payment request is closed. If the customer still approves it on their phone, the
   * payment reports as arriving for an order that cannot take it, and staff refund it (PaymentService.onSucceeded).
   */
  private async closeOpenPayments(tx: Executor, orderId: string, actorId: string | null): Promise<void> {
    const open = await tx
      .select()
      .from(schema.payments)
      .where(
        and(eq(schema.payments.orderId, orderId), inArray(schema.payments.status, ['INITIATED', 'PENDING'])),
      )
      .for('update');
    for (const payment of open) {
      await tx
        .update(schema.payments)
        .set({ status: 'CANCELLED', completedAt: this.deps.now() })
        .where(eq(schema.payments.id, payment.id));
      await tx.insert(schema.paymentTransactions).values({
        paymentId: payment.id,
        type: 'MANUAL_ADJUSTMENT',
        resultingStatus: 'CANCELLED',
        amount: payment.amount,
        currency: payment.currency,
        payload: { reason: 'order cancelled before delivery' },
        actorId,
      });
    }
  }

  /** The single place an order's status changes: lifecycle check, update, history row. */
  async transition(
    tx: Executor,
    order: OrderRow,
    to: OrderStatus,
    actorId: string | null,
    note: string | null,
    extra: Partial<typeof schema.orders.$inferInsert> = {},
  ): Promise<OrderRow> {
    orderLifecycle.assertTransition(order.status, to);
    // Pay on delivery: the goods are handed over only after the customer's wallet approved the payment.
    if (to === 'DELIVERED' && order.payOnDeliveryProvider && !order.paidAt) {
      throw new AppError(
        'CONFLICT',
        'The payment has not been collected yet. Ask the customer to approve the payment request first.',
        'DOOR_PAYMENT_NOT_COLLECTED',
      );
    }
    const [updated] = await tx
      .update(schema.orders)
      .set({ status: to, ...extra })
      .where(and(eq(schema.orders.id, order.id), eq(schema.orders.status, order.status)))
      .returning();
    if (!updated)
      throw new AppError(
        'CONFLICT',
        'The order changed while you were working on it. Please retry.',
        'STALE_ORDER',
      );
    await tx
      .insert(schema.orderStatusEvents)
      .values({ orderId: order.id, previousStatus: order.status, newStatus: to, actorId, note });
    return updated;
  }

  async lockOrder(tx: Executor, orderId: string): Promise<OrderRow | null> {
    const [order] = await tx.select().from(schema.orders).where(eq(schema.orders.id, orderId)).for('update');
    return order ?? null;
  }

  /** Cancels orders left unpaid (and without a payment in progress) for too long, returning their stock. */
  async cancelStaleOrders(): Promise<number> {
    const cutoff = new Date(this.deps.now().getTime() - UNPAID_ORDER_TTL_HOURS * 3_600_000);
    const stale = await this.deps.db
      .select({ id: schema.orders.id })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.status, 'PENDING_PAYMENT'),
          lt(schema.orders.placedAt, cutoff),
          sql`not exists (select 1 from payments p where p.order_id = ${schema.orders.id} and p.status in ('INITIATED', 'PENDING'))`,
          // Replacement orders wait for staff to approve the exchange; that is not abandonment.
          sql`not exists (select 1 from exchanges e where e.replacement_order_id = ${schema.orders.id} and e.status = 'REQUESTED')`,
          // Renewal orders of a started subscription follow the renewal grace period instead.
          sql`not exists (select 1 from subscriptions s where s.id = ${schema.orders.subscriptionId} and s.status <> 'PENDING')`,
        ),
      );
    let cancelled = 0;
    for (const { id } of stale) {
      await this.deps.db.transaction(async (tx) => {
        const order = await this.lockOrder(tx, id);
        if (order?.status !== 'PENDING_PAYMENT') return;
        await this.cancelUnpaid(tx, order, null, 'Cancelled automatically: not paid in time');
        cancelled += 1;
      });
    }
    return cancelled;
  }

  // --- staff ------------------------------------------------------------------

  async listForStaff(
    context: ServiceContext,
    filter: { status?: OrderStatus | null; search?: string | null },
    request: PageRequest,
  ): Promise<Page<OrderRow> & { totalCount: number }> {
    requirePermission(context, 'order:read');
    const size = pageSize(request);
    const offset = decodeOffset(request.after);
    const where = and(
      filter.status ? eq(schema.orders.status, filter.status) : undefined,
      filter.search?.trim()
        ? ilike(schema.orders.orderNumber, `%${filter.search.trim().replace(/[\\%_]/g, '')}%`)
        : undefined,
    );
    const rows = await this.deps.db
      .select()
      .from(schema.orders)
      .where(where)
      .orderBy(desc(schema.orders.placedAt), desc(schema.orders.id))
      .limit(size + 1)
      .offset(offset);
    const [count] = await this.deps.db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.orders)
      .where(where);
    const items = rows.slice(0, size);
    return {
      items,
      hasNextPage: rows.length > size,
      endCursor: items.length ? encodeOffset(offset + items.length) : null,
      totalCount: count?.n ?? 0,
    };
  }

  async updateStatusAsStaff(
    context: ServiceContext,
    rawOrderId: unknown,
    rawStatus: unknown,
    rawNote: unknown,
  ) {
    const actor = requirePermission(context, 'order:write');
    const orderId = parseInput(z.uuid(), rawOrderId);
    const status = parseInput(z.string(), rawStatus) as OrderStatus;
    const note = parseInput(z.string().trim().max(500).nullish(), rawNote) ?? null;
    if (!STAFF_SETTABLE.includes(status)) {
      throw new AppError(
        'VALIDATION_FAILED',
        'This status is set automatically, not by hand.',
        'STATUS_NOT_SETTABLE',
      );
    }
    return this.deps.db.transaction(async (tx) => {
      const order = await this.lockOrder(tx, orderId);
      if (!order) throw new AppError('NOT_FOUND', 'Order not found.');
      if (status === 'CANCELLED') {
        const cancelled =
          order.status === 'PENDING_PAYMENT'
            ? await this.cancelUnpaid(tx, order, actor.userId, note ?? 'Cancelled by staff')
            : await this.cancelPaid(
                tx,
                order,
                actor.userId,
                note ?? 'Cancelled by staff',
                REFUND_POLICY.staffCancellableStatuses,
              );
        await recordAudit(tx, context, {
          action: 'order.cancelled',
          entityType: 'order',
          entityId: order.id,
          previousValue: { status: order.status },
          newValue: { status: 'CANCELLED', note },
        });
        return cancelled;
      }
      const updated = await this.transition(tx, order, status, actor.userId, note);
      await recordAudit(tx, context, {
        action: 'order.status_changed',
        entityType: 'order',
        entityId: order.id,
        previousValue: { status: order.status },
        newValue: { status, note },
      });
      return updated;
    });
  }

  // --- internals --------------------------------------------------------------

  /** Cancels an unpaid order: stock and garments released, credit and coupon given back. */
  async cancelUnpaid(tx: Executor, order: OrderRow, actorId: string | null, note: string): Promise<OrderRow> {
    if (order.status !== 'PENDING_PAYMENT') {
      throw new AppError('CONFLICT', 'Only unpaid orders can be cancelled.', 'ORDER_NOT_CANCELLABLE');
    }
    await this.assertNoPaymentInProgress(tx, order.id);
    const updated = await this.transition(tx, order, 'CANCELLED', actorId, note, {
      cancelledAt: this.deps.now(),
    });
    const items = await tx.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, order.id));
    for (const item of items.filter((line) => line.garmentId === null)) {
      await this.deps.inventory.release(tx, item.variantId, item.quantity, { type: 'order', id: order.id });
    }
    if (order.creditAppliedAmount > 0) {
      await this.deps.credit.returnForCancelledOrder(
        tx,
        order.userId,
        order.id,
        money(order.creditAppliedAmount, this.deps.currency),
        actorId,
      );
    }
    // The coupon was not really used, so it can be used again.
    await tx.delete(schema.discounts).where(eq(schema.discounts.orderId, order.id));
    for (const hook of this.hooks.cancelled) await hook(tx, updated);
    return updated;
  }

  /**
   * Cancels a paid order (REFUND_POLICY, open question 13): stock and garments released, credit and coupon given
   * back, and a full refund of the payment requested for staff approval.
   */
  private async cancelPaid(
    tx: Executor,
    order: OrderRow,
    actorId: string,
    note: string,
    allowedStatuses: readonly OrderStatus[],
  ): Promise<OrderRow> {
    if (
      !REFUND_POLICY.cancellableOrderTypes.includes(order.type) ||
      !allowedStatuses.includes(order.status)
    ) {
      throw new AppError('CONFLICT', 'This order can no longer be cancelled.', 'ORDER_NOT_CANCELLABLE');
    }
    if (!this.refunds) throw new Error('Refunds are not attached to the order service');
    const updated = await this.transition(tx, order, 'CANCELLED', actorId, note, {
      cancelledAt: this.deps.now(),
    });
    const items = await tx.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, order.id));
    // Payment took the stock off hand (InventoryService.commitSale); put it back.
    for (const item of items.filter((line) => line.garmentId === null)) {
      await this.deps.inventory.restockCancelledSale(tx, item.variantId, item.quantity, {
        type: 'order',
        id: order.id,
      });
    }
    if (order.creditAppliedAmount > 0) {
      await this.deps.credit.returnForCancelledOrder(
        tx,
        order.userId,
        order.id,
        money(order.creditAppliedAmount, this.deps.currency),
        actorId,
      );
    }
    await tx.delete(schema.discounts).where(eq(schema.discounts.orderId, order.id));
    await this.closeOpenPayments(tx, order.id, actorId);
    await this.refunds.requestForCancelledOrder(
      tx,
      order,
      actorId,
      `Order ${order.orderNumber} cancelled: ${note}`,
    );
    for (const hook of this.hooks.cancelled) await hook(tx, updated);
    return updated;
  }

  private async assertNoPaymentInProgress(tx: Executor, orderId: string): Promise<void> {
    const [open] = await tx
      .select({ id: schema.payments.id })
      .from(schema.payments)
      .where(
        and(eq(schema.payments.orderId, orderId), inArray(schema.payments.status, ['INITIATED', 'PENDING'])),
      );
    if (open) {
      throw new AppError('CONFLICT', 'A payment for this order is still in progress.', 'PAYMENT_IN_PROGRESS');
    }
  }

  private async quote(
    db: Executor,
    userId: string,
    input: CheckoutInput,
    forUpdate: boolean,
  ): Promise<Quote> {
    const { currency } = this.deps;
    const cart = await this.deps.cart.findActiveCart(db, userId);
    const lines = cart ? await this.deps.cart.lines(db, cart.id) : [];
    if (!cart || lines.length === 0)
      throw new AppError('VALIDATION_FAILED', 'Your cart is empty.', 'EMPTY_CART');
    for (const line of lines) await this.deps.cart.assertPurchasable(db, line.variantId);

    const [address] = await db
      .select()
      .from(schema.addresses)
      .where(
        and(
          eq(schema.addresses.id, input.shippingAddressId),
          eq(schema.addresses.userId, userId),
          isNull(schema.addresses.deletedAt),
        ),
      );
    if (!address) throw new AppError('NOT_FOUND', 'Address not found.');

    const [option] = await db
      .select()
      .from(schema.deliveryOptions)
      .where(
        and(
          eq(schema.deliveryOptions.code, input.deliveryOptionCode),
          eq(schema.deliveryOptions.marketCode, this.deps.marketCode),
          eq(schema.deliveryOptions.isActive, true),
        ),
      );
    if (!option)
      throw new AppError(
        'VALIDATION_FAILED',
        'This delivery option is not available.',
        'UNKNOWN_DELIVERY_OPTION',
      );

    const shipping = money(option.feeAmount, currency);
    const subtotal = money(
      lines.reduce((total, line) => total + line.lineTotal.amount, 0),
      currency,
    );

    let promotion: PromotionRow | null = null;
    let promotionRejection: Quote['promotionRejection'] = null;
    let discount = zero(currency);
    if (input.promotionCode) {
      promotion = forUpdate
        ? await this.deps.promotions.findByCodeForUpdate(db, input.promotionCode)
        : await this.deps.promotions.findByCode(db, input.promotionCode);
      if (!promotion) {
        promotionRejection = 'UNKNOWN';
      } else {
        const usage = await this.deps.promotions.usage(db, promotion.id, userId);
        const result = evaluatePromotion(
          { ...promotion, currency: promotion.currency.trim() },
          { subtotal, shipping, scope: 'ORDER', usage, now: this.deps.now() },
        );
        if (result.ok) discount = result.discount;
        else promotionRejection = result.reason;
      }
    }

    const availableCredit = await this.deps.credit.balance(db, userId);
    const totals = calculateTotals({
      currency,
      lines,
      shipping,
      discount,
      creditAvailable: input.applyExchangeCredit ? availableCredit : zero(currency),
      tax: getMarket(this.deps.marketCode).tax,
    });

    return {
      cartId: cart.id,
      lines,
      address: {
        id: address.id,
        recipientName: address.recipientName,
        phone: address.phone,
        countryCode: address.countryCode,
        region: address.region,
        district: address.district,
        sector: address.sector,
        street: address.street,
        directions: address.directions,
      },
      deliveryOptionCode: option.code,
      promotion: promotionRejection ? null : promotion,
      promotionRejection,
      availableCredit,
      totals,
    };
  }

  /** Serialises a customer's checkouts and credit spending by locking their profile row. */
  async lockCustomer(tx: Executor, userId: string): Promise<void> {
    await tx
      .select({ id: schema.customerProfiles.id })
      .from(schema.customerProfiles)
      .where(eq(schema.customerProfiles.userId, userId))
      .for('update');
  }

  private async lockOwnOrder(tx: Executor, userId: string, orderId: string): Promise<OrderRow> {
    const [order] = await tx
      .select()
      .from(schema.orders)
      .where(and(eq(schema.orders.id, orderId), eq(schema.orders.userId, userId)))
      .for('update');
    if (!order) throw new AppError('NOT_FOUND', 'Order not found.');
    return order;
  }

  private async findByIdempotencyKey(db: Executor, userId: string, key: string): Promise<OrderRow | null> {
    const [order] = await db
      .select()
      .from(schema.orders)
      .where(and(eq(schema.orders.userId, userId), eq(schema.orders.idempotencyKey, key)));
    return order ?? null;
  }

  /** Inserts an order with a fresh customer-facing number; used by subscriptions and exchanges too. */
  async insertWithUniqueNumber(
    tx: Executor,
    values: Omit<typeof schema.orders.$inferInsert, 'orderNumber'>,
  ): Promise<OrderRow> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const orderNumber = generateReference('BMB');
      const [existing] = await tx
        .select({ id: schema.orders.id })
        .from(schema.orders)
        .where(eq(schema.orders.orderNumber, orderNumber));
      if (existing) continue;
      const [order] = await tx
        .insert(schema.orders)
        .values({ ...values, orderNumber })
        .returning();
      if (order) return order;
    }
    throw new Error('Could not allocate a unique order number');
  }
}
