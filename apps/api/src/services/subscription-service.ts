import { SUBSCRIPTION_POLICY, getMarket } from '@bambino/config';
import { type Database, type Executor, schema } from '@bambino/database';
import { and, asc, desc, eq, inArray, isNull, lte, ne, sql } from '@bambino/database/orm';
import {
  BILLING_INTERVALS,
  type BillingInterval,
  type SubscriptionEventType,
  type SubscriptionStatus,
} from '@bambino/types';
import { type CurrencyCode, money, zero } from '@bambino/utils';
import { z } from 'zod';
import { subscriptionLifecycle } from '../domain/lifecycles';
import { calculateTotals, evaluatePromotion } from '../domain/pricing';
import type { Logger } from '../infra/logger';
import { recordAudit } from './audit-service';
import type { BabyService } from './baby-service';
import { type ServiceContext, requirePermission, requireUser } from './context';
import { AppError, isUniqueViolation, parseInput } from './errors';
import type { GarmentService } from './garment-service';
import type { NotificationService } from './notification-service';
import type { OrderRow, OrderService } from './order-service';
import { type Page, type PageRequest, decodeOffset, encodeOffset, pageSize } from './pagination';
import type { PaymentService } from './payment-service';
import type { PromotionService } from './promotion-service';

export type PlanRow = typeof schema.subscriptionPlans.$inferSelect;
export type SubscriptionRow = typeof schema.subscriptions.$inferSelect;
export type SubscriptionItemRow = typeof schema.subscriptionItems.$inferSelect;
export type SubscriptionEventRow = typeof schema.subscriptionEvents.$inferSelect;

const MONTHS: Record<BillingInterval, number> = { MONTHLY: 1, QUARTERLY: 3, ANNUAL: 12 };

export function addInterval(from: Date, interval: BillingInterval, cycles = 1): Date {
  const next = new Date(from.getTime());
  const day = next.getUTCDate();
  next.setUTCMonth(next.getUTCMonth() + MONTHS[interval] * cycles);
  // 31 January + 1 month lands on the last day of February, not in March.
  if (next.getUTCDate() !== day) next.setUTCDate(0);
  return next;
}

const createSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(100),
  planId: z.uuid(),
  babyProfileId: z.uuid(),
  shippingAddressId: z.uuid(),
  deliveryOptionCode: z.string().trim().min(1).max(40),
  promotionCode: z.string().trim().max(30).nullish(),
  paymentMethodId: z.uuid().nullish(),
});

const planSchema = z.object({
  id: z.uuid().nullish(),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,40}$/, 'validation.plan_code.invalid'),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(2_000),
  billingInterval: z.enum(BILLING_INTERVALS),
  priceAmount: z.number().int().min(0).max(100_000_000),
  itemsPerCycle: z.number().int().min(1).max(30),
  allowedCategoryIds: z.array(z.uuid()).max(50),
  exchangesPerCycle: z.number().int().min(0).max(100).nullish(),
  isActive: z.boolean(),
});

export interface SubscriptionServiceDependencies {
  db: Database;
  orders: OrderService;
  payments: PaymentService;
  promotions: PromotionService;
  garments: GarmentService;
  babies: BabyService;
  notifications: NotificationService;
  logger: Logger;
  marketCode: string;
  currency: CurrencyCode;
  now: () => Date;
}

/**
 * Subscriptions and their billing cycles. Each cycle is an order of type SUBSCRIPTION_CYCLE;
 * the subscription becomes ACTIVE, or renews, only when that order is paid.
 */
export class SubscriptionService {
  constructor(private readonly deps: SubscriptionServiceDependencies) {}

  async listPlans(): Promise<PlanRow[]> {
    return this.deps.db
      .select()
      .from(schema.subscriptionPlans)
      .where(
        and(
          eq(schema.subscriptionPlans.marketCode, this.deps.marketCode),
          eq(schema.subscriptionPlans.isActive, true),
        ),
      )
      .orderBy(asc(schema.subscriptionPlans.priceAmount));
  }

  async plansByIds(ids: readonly string[]): Promise<PlanRow[]> {
    return ids.length
      ? this.deps.db
          .select()
          .from(schema.subscriptionPlans)
          .where(inArray(schema.subscriptionPlans.id, [...ids]))
      : [];
  }

  async categoriesForPlans(planIds: readonly string[]) {
    if (planIds.length === 0) return [];
    return this.deps.db
      .select({ planId: schema.subscriptionPlanCategories.planId, category: schema.categories })
      .from(schema.subscriptionPlanCategories)
      .innerJoin(schema.categories, eq(schema.categories.id, schema.subscriptionPlanCategories.categoryId))
      .where(inArray(schema.subscriptionPlanCategories.planId, [...planIds]));
  }

  /** Creates a PENDING subscription and its first cycle order. Re-sending the same key returns the same subscription. */
  async create(context: ServiceContext, rawInput: unknown): Promise<SubscriptionRow> {
    const actor = requireUser(context);
    const input = parseInput(createSchema, rawInput);
    const { db, now, currency } = this.deps;

    const existing = await this.subscriptionForOrderKey(db, actor.userId, input.idempotencyKey);
    if (existing) return existing;

    try {
      return await db.transaction(async (tx) => {
        await this.deps.orders.lockCustomer(tx, actor.userId);
        const again = await this.subscriptionForOrderKey(tx, actor.userId, input.idempotencyKey);
        if (again) return again;

        await this.deps.babies.requireOwned(tx, actor.userId, input.babyProfileId);
        const plan = await this.activePlan(tx, input.planId);
        const [address] = await tx
          .select()
          .from(schema.addresses)
          .where(
            and(
              eq(schema.addresses.id, input.shippingAddressId),
              eq(schema.addresses.userId, actor.userId),
              isNull(schema.addresses.deletedAt),
            ),
          );
        if (!address) throw new AppError('NOT_FOUND', 'Address not found.');
        const option = await this.deliveryOption(tx, input.deliveryOptionCode);
        if (input.paymentMethodId) {
          const [method] = await tx
            .select({ id: schema.paymentMethods.id })
            .from(schema.paymentMethods)
            .where(
              and(
                eq(schema.paymentMethods.id, input.paymentMethodId),
                eq(schema.paymentMethods.userId, actor.userId),
                isNull(schema.paymentMethods.deletedAt),
              ),
            );
          if (!method) throw new AppError('NOT_FOUND', 'Payment method not found.');
        }

        const planPrice = money(plan.priceAmount, currency);
        const shipping = money(option.feeAmount, currency);
        let discount = zero(currency);
        let promotionId: string | null = null;
        if (input.promotionCode) {
          const promotion = await this.deps.promotions.findByCodeForUpdate(tx, input.promotionCode);
          if (!promotion)
            throw new AppError(
              'VALIDATION_FAILED',
              'This promotion code does not exist.',
              'PROMOTION_UNKNOWN',
            );
          const usage = await this.deps.promotions.usage(tx, promotion.id, actor.userId);
          const result = evaluatePromotion(
            { ...promotion, currency: promotion.currency.trim() },
            { subtotal: planPrice, shipping, scope: 'SUBSCRIPTION', usage, now: now() },
          );
          if (!result.ok)
            throw new AppError(
              'VALIDATION_FAILED',
              'This promotion cannot be applied.',
              `PROMOTION_${result.reason}`,
            );
          discount = result.discount;
          promotionId = promotion.id;
        }
        const totals = calculateTotals({
          currency,
          lines: [{ unitPrice: planPrice, quantity: 1 }],
          shipping,
          discount,
          tax: getMarket(this.deps.marketCode).tax,
        });

        const [subscription] = await tx
          .insert(schema.subscriptions)
          .values({
            userId: actor.userId,
            babyProfileId: input.babyProfileId,
            planId: plan.id,
            status: 'PENDING',
            priceAmount: plan.priceAmount,
            currency,
            shippingAddressId: address.id,
            paymentMethodId: input.paymentMethodId ?? null,
          })
          .returning();
        if (!subscription) throw new Error('Subscription insert returned no row');
        await this.recordEvent(tx, subscription, 'CREATED', null, 'PENDING', actor.userId);

        const order = await this.createCycleOrder(tx, subscription, {
          planPriceAmount: plan.priceAmount,
          discountAmount: totals.discount.amount,
          shippingAmount: totals.shipping.amount,
          taxAmount: totals.tax.amount,
          deliveryOptionCode: option.code,
          idempotencyKey: input.idempotencyKey,
          address,
          actorId: actor.userId,
        });
        if (promotionId && totals.discount.amount > 0) {
          await tx.insert(schema.discounts).values({
            promotionId,
            userId: actor.userId,
            orderId: order.id,
            subscriptionId: subscription.id,
            amount: totals.discount.amount,
            currency,
          });
        }
        return subscription;
      });
    } catch (error) {
      if (isUniqueViolation(error, 'subscriptions_one_live_per_baby_uq')) {
        throw new AppError('CONFLICT', 'This baby already has a subscription.', 'SUBSCRIPTION_EXISTS');
      }
      if (isUniqueViolation(error, 'orders_user_idempotency_uq')) {
        const winner = await this.subscriptionForOrderKey(db, actor.userId, input.idempotencyKey);
        if (winner) return winner;
      }
      throw error;
    }
  }

  // --- order hooks --------------------------------------------------------------

  /** A cycle order was paid: activate a new subscription or advance a renewing one. */
  async onOrderPaid(tx: Executor, order: OrderRow): Promise<void> {
    if (order.type !== 'SUBSCRIPTION_CYCLE' || !order.subscriptionId) return;
    const subscription = await this.lock(tx, order.subscriptionId);
    const plan = await this.planFor(tx, subscription.pendingPlanId ?? subscription.planId);
    const now = this.deps.now();

    if (subscription.status === 'PENDING') {
      const periodEnd = addInterval(now, plan.billingInterval);
      await this.transition(tx, subscription, 'ACTIVE', 'ACTIVATED', null, {
        startedAt: now,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        nextBillingAt: periodEnd,
      });
      await tx.insert(schema.analyticsEvents).values({
        eventName: 'SUBSCRIPTION_STARTED',
        userId: subscription.userId,
        properties: { subscriptionId: subscription.id, plan: plan.code },
        occurredAt: now,
      });
      await this.deps.notifications.notify(tx, subscription.userId, 'SUBSCRIPTION_STARTED', {
        plan: plan.name,
      });
    } else if (subscription.status === 'PAST_DUE' || subscription.status === 'ACTIVE') {
      const start = subscription.currentPeriodEnd ?? now;
      const periodEnd = addInterval(start, plan.billingInterval);
      await this.transition(
        tx,
        subscription,
        subscription.status === 'PAST_DUE' ? 'ACTIVE' : null,
        'RENEWED',
        null,
        {
          currentPeriodStart: start,
          currentPeriodEnd: periodEnd,
          nextBillingAt: periodEnd,
          renewalAttempts: 0,
          planId: plan.id,
          priceAmount: plan.priceAmount,
          pendingPlanId: null,
        },
      );
      await tx.insert(schema.analyticsEvents).values({
        eventName: 'SUBSCRIPTION_RENEWED',
        userId: subscription.userId,
        properties: { subscriptionId: subscription.id },
        occurredAt: now,
      });
      await this.deps.notifications.notify(tx, subscription.userId, 'SUBSCRIPTION_RENEWED', {
        plan: plan.name,
      });
    } else {
      this.deps.logger.error('cycle order paid for a subscription that is not awaiting payment', {
        subscriptionId: subscription.id,
        status: subscription.status,
      });
    }
  }

  /** Delivered cycle orders put the selected items with the customer. */
  async onOrderDelivered(tx: Executor, order: OrderRow): Promise<void> {
    if (order.type !== 'SUBSCRIPTION_CYCLE') return;
    const items = await tx
      .select({ id: schema.orderItems.id })
      .from(schema.orderItems)
      .where(eq(schema.orderItems.orderId, order.id));
    if (items.length === 0) return;
    await tx
      .update(schema.subscriptionItems)
      .set({ status: 'WITH_CUSTOMER' })
      .where(
        inArray(
          schema.subscriptionItems.orderItemId,
          items.map((item) => item.id),
        ),
      );
  }

  /** The first cycle order was cancelled or never paid: the subscription never started. */
  async onOrderCancelled(tx: Executor, order: OrderRow): Promise<void> {
    if (order.type !== 'SUBSCRIPTION_CYCLE' || !order.subscriptionId) return;
    const subscription = await this.lock(tx, order.subscriptionId);
    if (subscription.status === 'PENDING') {
      await this.transition(tx, subscription, 'EXPIRED', 'EXPIRED', null, { endedAt: this.deps.now() });
    }
  }

  // --- customer actions -----------------------------------------------------------

  async listOwn(context: ServiceContext): Promise<SubscriptionRow[]> {
    const actor = requireUser(context);
    return this.deps.db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, actor.userId))
      .orderBy(desc(schema.subscriptions.createdAt));
  }

  async getOwn(context: ServiceContext, rawId: unknown): Promise<SubscriptionRow | null> {
    const actor = requireUser(context);
    const parsed = z.uuid().safeParse(rawId);
    if (!parsed.success) return null;
    const [row] = await this.deps.db
      .select()
      .from(schema.subscriptions)
      .where(and(eq(schema.subscriptions.id, parsed.data), eq(schema.subscriptions.userId, actor.userId)));
    return row ?? null;
  }

  async pause(context: ServiceContext, rawId: unknown, rawResumeAt: unknown): Promise<SubscriptionRow> {
    const actor = requireUser(context);
    const resumeAt = parseInput(z.date().nullish(), rawResumeAt) ?? null;
    const now = this.deps.now();
    if (
      resumeAt &&
      (resumeAt <= now || resumeAt.getTime() - now.getTime() > SUBSCRIPTION_POLICY.maxPauseDays * 86_400_000)
    ) {
      throw new AppError(
        'VALIDATION_FAILED',
        `A pause can last up to ${SUBSCRIPTION_POLICY.maxPauseDays} days.`,
        'INVALID_RESUME_DATE',
      );
    }
    return this.deps.db.transaction(async (tx) => {
      const subscription = await this.lockOwn(tx, actor.userId, rawId);
      return this.transition(tx, subscription, 'PAUSED', 'PAUSED', actor.userId, { pausedAt: now, resumeAt });
    });
  }

  async resume(context: ServiceContext, rawId: unknown): Promise<SubscriptionRow> {
    const actor = requireUser(context);
    return this.deps.db.transaction(async (tx) => {
      const subscription = await this.lockOwn(tx, actor.userId, rawId);
      return this.resumeLocked(tx, subscription, actor.userId);
    });
  }

  /** By default the subscription runs until the end of the paid period. Unpaid or paused ones end now. */
  async cancel(
    context: ServiceContext,
    rawId: unknown,
    rawReason: unknown,
    rawImmediately: unknown,
  ): Promise<SubscriptionRow> {
    const actor = requireUser(context);
    const reason = parseInput(z.string().trim().max(500).nullish(), rawReason) ?? null;
    const immediately = parseInput(z.boolean().nullish(), rawImmediately) ?? false;
    return this.deps.db.transaction(async (tx) => {
      const subscription = await this.lockOwn(tx, actor.userId, rawId);
      return this.cancelLocked(tx, subscription, actor.userId, reason, immediately);
    });
  }

  /** Plan changes take effect at the next renewal (SUBSCRIPTION_POLICY.planChangeTiming). */
  async changePlan(context: ServiceContext, rawId: unknown, rawPlanId: unknown): Promise<SubscriptionRow> {
    const actor = requireUser(context);
    const planId = parseInput(z.uuid(), rawPlanId);
    return this.deps.db.transaction(async (tx) => {
      const subscription = await this.lockOwn(tx, actor.userId, rawId);
      if (!['ACTIVE', 'PAUSED', 'PAST_DUE'].includes(subscription.status)) {
        throw new AppError(
          'CONFLICT',
          'This subscription cannot change plan now.',
          'PLAN_CHANGE_NOT_ALLOWED',
        );
      }
      const plan = await this.activePlan(tx, planId);
      const pendingPlanId = plan.id === subscription.planId ? null : plan.id;
      const [updated] = await tx
        .update(schema.subscriptions)
        .set({ pendingPlanId })
        .where(eq(schema.subscriptions.id, subscription.id))
        .returning();
      if (!updated) throw new Error('Subscription vanished');
      await this.recordEvent(
        tx,
        updated,
        'PLAN_CHANGE_SCHEDULED',
        subscription.status,
        subscription.status,
        actor.userId,
        { planId: pendingPlanId },
      );
      return updated;
    });
  }

  /**
   * Chooses the garments for the current cycle. Each choice reserves one physical garment
   * (circulated ones first). Choosing again replaces the earlier choice and frees its garments.
   */
  async selectItems(
    context: ServiceContext,
    rawId: unknown,
    rawVariantIds: unknown,
  ): Promise<SubscriptionRow> {
    const actor = requireUser(context);
    const variantIds = parseInput(z.array(z.uuid()).min(1).max(30), rawVariantIds);
    return this.deps.db.transaction(async (tx) => {
      const subscription = await this.lockOwn(tx, actor.userId, rawId);
      const plan = await this.planFor(tx, subscription.planId);
      if (variantIds.length > plan.itemsPerCycle) {
        throw new AppError(
          'VALIDATION_FAILED',
          `This plan includes ${plan.itemsPerCycle} items per cycle.`,
          'TOO_MANY_ITEMS',
        );
      }
      const order = await this.currentCycleOrder(tx, subscription.id);
      if (!order || !['PENDING_PAYMENT', 'PAID'].includes(order.status)) {
        throw new AppError(
          'CONFLICT',
          'Items can be chosen until the order is being prepared.',
          'SELECTION_CLOSED',
        );
      }

      const allowed = await tx
        .select({ categoryId: schema.subscriptionPlanCategories.categoryId })
        .from(schema.subscriptionPlanCategories)
        .where(eq(schema.subscriptionPlanCategories.planId, plan.id));
      const variants = await tx
        .select({ variant: schema.productVariants, product: schema.products })
        .from(schema.productVariants)
        .innerJoin(schema.products, eq(schema.products.id, schema.productVariants.productId))
        .where(inArray(schema.productVariants.id, variantIds));
      const byId = new Map(variants.map((row) => [row.variant.id, row]));
      for (const id of variantIds) {
        const row = byId.get(id);
        if (!row || !row.variant.isActive || !row.product.isActive || row.product.deletedAt)
          throw new AppError('NOT_FOUND', 'An item is not available.');
        if (!row.product.subscriptionEligible)
          throw new AppError(
            'VALIDATION_FAILED',
            'An item is not part of subscriptions.',
            'NOT_SUBSCRIPTION_ELIGIBLE',
          );
        if (allowed.length > 0 && !allowed.some((entry) => entry.categoryId === row.product.categoryId)) {
          throw new AppError(
            'VALIDATION_FAILED',
            'An item is not included in this plan.',
            'CATEGORY_NOT_IN_PLAN',
          );
        }
      }

      // Replace the earlier choice for this cycle.
      const previous = await tx
        .select()
        .from(schema.orderItems)
        .where(eq(schema.orderItems.orderId, order.id));
      for (const item of previous) {
        if (item.garmentId) await this.deps.garments.release(tx, item.garmentId, 'selection changed');
      }
      const cycle = await this.cycleNumber(tx, subscription.id, order.id);
      await tx
        .delete(schema.subscriptionItems)
        .where(
          and(
            eq(schema.subscriptionItems.subscriptionId, subscription.id),
            eq(schema.subscriptionItems.cycleNumber, cycle),
          ),
        );
      await tx.delete(schema.orderItems).where(eq(schema.orderItems.orderId, order.id));

      for (const id of variantIds) {
        const row = byId.get(id);
        if (!row) continue;
        const garment = await this.deps.garments.reserveForVariant(tx, id, { type: 'order', id: order.id });
        const [orderItem] = await tx
          .insert(schema.orderItems)
          .values({
            orderId: order.id,
            variantId: id,
            garmentId: garment.id,
            productName: row.product.name,
            sku: row.variant.sku,
            sizeCode: row.variant.sizeCode,
            color: row.variant.color,
            // Included in the plan price.
            unitPriceAmount: 0,
            quantity: 1,
            lineTotalAmount: 0,
          })
          .returning({ id: schema.orderItems.id });
        await tx.insert(schema.subscriptionItems).values({
          subscriptionId: subscription.id,
          cycleNumber: cycle,
          variantId: id,
          garmentId: garment.id,
          orderItemId: orderItem?.id ?? null,
          status: 'SELECTED',
        });
      }
      return subscription;
    });
  }

  // --- reads for GraphQL --------------------------------------------------------------

  async eventsFor(subscriptionIds: readonly string[]): Promise<SubscriptionEventRow[]> {
    if (subscriptionIds.length === 0) return [];
    return this.deps.db
      .select()
      .from(schema.subscriptionEvents)
      .where(inArray(schema.subscriptionEvents.subscriptionId, [...subscriptionIds]))
      .orderBy(asc(schema.subscriptionEvents.sequence));
  }

  /** Items of the latest cycle that has any. */
  async currentItemsFor(subscriptionIds: readonly string[]): Promise<SubscriptionItemRow[]> {
    if (subscriptionIds.length === 0) return [];
    const rows = await this.deps.db
      .select()
      .from(schema.subscriptionItems)
      .where(inArray(schema.subscriptionItems.subscriptionId, [...subscriptionIds]))
      .orderBy(desc(schema.subscriptionItems.cycleNumber), asc(schema.subscriptionItems.createdAt));
    const latest = new Map<string, number>();
    for (const row of rows)
      if (!latest.has(row.subscriptionId)) latest.set(row.subscriptionId, row.cycleNumber);
    return rows.filter((row) => latest.get(row.subscriptionId) === row.cycleNumber);
  }

  async ordersAwaitingPayment(subscriptionIds: readonly string[]): Promise<OrderRow[]> {
    if (subscriptionIds.length === 0) return [];
    return this.deps.db
      .select()
      .from(schema.orders)
      .where(
        and(
          inArray(schema.orders.subscriptionId, [...subscriptionIds]),
          eq(schema.orders.status, 'PENDING_PAYMENT'),
        ),
      );
  }

  async byIdsForUser(userIds: readonly string[]): Promise<SubscriptionRow[]> {
    if (userIds.length === 0) return [];
    return this.deps.db
      .select()
      .from(schema.subscriptions)
      .where(inArray(schema.subscriptions.userId, [...userIds]))
      .orderBy(desc(schema.subscriptions.createdAt));
  }

  // --- background job -------------------------------------------------------------------

  /**
   * Due renewals: creates the renewal order, asks a saved wallet for payment, moves unpaid
   * renewals to PAST_DUE, retries, expires after the grace period, ends scheduled cancellations,
   * resumes pauses that reached their date and sends renewal reminders.
   */
  async runRenewals(): Promise<{
    renewalsCreated: number;
    expired: number;
    cancelled: number;
    resumed: number;
    reminded: number;
  }> {
    const { db } = this.deps;
    const now = this.deps.now();
    const result = { renewalsCreated: 0, expired: 0, cancelled: 0, resumed: 0, reminded: 0 };

    const resumable = await db
      .select({ id: schema.subscriptions.id })
      .from(schema.subscriptions)
      .where(and(eq(schema.subscriptions.status, 'PAUSED'), lte(schema.subscriptions.resumeAt, now)));
    for (const { id } of resumable) {
      await db.transaction(async (tx) => {
        const subscription = await this.lock(tx, id);
        if (subscription.status === 'PAUSED') await this.resumeLocked(tx, subscription, null);
      });
      result.resumed += 1;
    }

    const due = await db
      .select({ id: schema.subscriptions.id })
      .from(schema.subscriptions)
      .where(
        and(
          inArray(schema.subscriptions.status, ['ACTIVE', 'PAST_DUE']),
          lte(schema.subscriptions.nextBillingAt, now),
        ),
      );
    for (const { id } of due) {
      const outcome = await db.transaction(async (tx) => this.processDue(tx, await this.lock(tx, id)));
      if (outcome === 'renewal') result.renewalsCreated += 1;
      if (outcome === 'expired') result.expired += 1;
      if (outcome === 'cancelled') result.cancelled += 1;
    }

    // Automatic payment requests for past-due renewals with a saved wallet.
    const pastDue = await db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.status, 'PAST_DUE'));
    for (const subscription of pastDue) await this.requestRenewalPayment(subscription);

    const horizon = new Date(now.getTime() + SUBSCRIPTION_POLICY.reminderDaysBeforeRenewal * 86_400_000);
    const upcoming = await db
      .select()
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.status, 'ACTIVE'),
          eq(schema.subscriptions.cancelAtPeriodEnd, false),
          lte(schema.subscriptions.nextBillingAt, horizon),
        ),
      );
    for (const subscription of upcoming) {
      const periodEnd = subscription.nextBillingAt?.toISOString() ?? '';
      const [sent] = await db
        .select({ id: schema.notifications.id })
        .from(schema.notifications)
        .where(
          and(
            eq(schema.notifications.userId, subscription.userId),
            eq(schema.notifications.type, 'SUBSCRIPTION_RENEWAL_REMINDER'),
            sql`${schema.notifications.params}->>'periodEnd' = ${periodEnd}`,
          ),
        );
      if (sent) continue;
      await this.deps.notifications.notify(db, subscription.userId, 'SUBSCRIPTION_RENEWAL_REMINDER', {
        periodEnd,
      });
      result.reminded += 1;
    }
    return result;
  }

  // --- staff ----------------------------------------------------------------------------

  async listForStaff(
    context: ServiceContext,
    status: SubscriptionStatus | null | undefined,
    request: PageRequest,
  ): Promise<Page<SubscriptionRow> & { totalCount: number }> {
    requirePermission(context, 'subscription:read');
    const size = pageSize(request);
    const offset = decodeOffset(request.after);
    const where = status ? eq(schema.subscriptions.status, status) : undefined;
    const rows = await this.deps.db
      .select()
      .from(schema.subscriptions)
      .where(where)
      .orderBy(desc(schema.subscriptions.createdAt), asc(schema.subscriptions.id))
      .limit(size + 1)
      .offset(offset);
    const [count] = await this.deps.db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.subscriptions)
      .where(where);
    const items = rows.slice(0, size);
    return {
      items,
      hasNextPage: rows.length > size,
      endCursor: items.length ? encodeOffset(offset + items.length) : null,
      totalCount: count?.n ?? 0,
    };
  }

  async listAllPlans(context: ServiceContext): Promise<PlanRow[]> {
    requirePermission(context, 'subscription:read');
    return this.deps.db
      .select()
      .from(schema.subscriptionPlans)
      .orderBy(asc(schema.subscriptionPlans.priceAmount));
  }

  /** Price changes apply to new subscriptions and to existing ones at their next renewal. */
  async upsertPlan(context: ServiceContext, rawInput: unknown): Promise<PlanRow> {
    requirePermission(context, 'plan:write');
    const input = parseInput(planSchema, rawInput);
    const values = {
      code: input.code,
      name: input.name,
      description: input.description,
      marketCode: this.deps.marketCode,
      billingInterval: input.billingInterval,
      priceAmount: input.priceAmount,
      currency: this.deps.currency,
      itemsPerCycle: input.itemsPerCycle,
      exchangePolicy: { exchangesPerCycle: input.exchangesPerCycle ?? null },
      isActive: input.isActive,
    };
    try {
      return await this.deps.db.transaction(async (tx) => {
        const before = input.id
          ? (
              await tx
                .select()
                .from(schema.subscriptionPlans)
                .where(eq(schema.subscriptionPlans.id, input.id))
            )[0]
          : undefined;
        if (input.id && !before) throw new AppError('NOT_FOUND', 'Plan not found.');
        const [plan] = input.id
          ? await tx
              .update(schema.subscriptionPlans)
              .set(values)
              .where(eq(schema.subscriptionPlans.id, input.id))
              .returning()
          : await tx.insert(schema.subscriptionPlans).values(values).returning();
        if (!plan) throw new Error('Plan upsert returned no row');
        await tx
          .delete(schema.subscriptionPlanCategories)
          .where(eq(schema.subscriptionPlanCategories.planId, plan.id));
        if (input.allowedCategoryIds.length > 0) {
          await tx
            .insert(schema.subscriptionPlanCategories)
            .values(input.allowedCategoryIds.map((categoryId) => ({ planId: plan.id, categoryId })));
        }
        await recordAudit(tx, context, {
          action: input.id ? 'plan.updated' : 'plan.created',
          entityType: 'subscription_plan',
          entityId: plan.id,
          previousValue: before ? { priceAmount: before.priceAmount, isActive: before.isActive } : null,
          newValue: { ...values, allowedCategoryIds: input.allowedCategoryIds },
        });
        return plan;
      });
    } catch (error) {
      if (isUniqueViolation(error, 'subscription_plans_code_uq'))
        throw new AppError('CONFLICT', 'This plan code is already used.', 'PLAN_CODE_IN_USE');
      throw error;
    }
  }

  async cancelAsStaff(context: ServiceContext, rawId: unknown, rawReason: unknown): Promise<SubscriptionRow> {
    const actor = requirePermission(context, 'subscription:write');
    const id = parseInput(z.uuid(), rawId);
    const reason = parseInput(z.string().trim().min(3).max(500), rawReason);
    return this.deps.db.transaction(async (tx) => {
      const subscription = await this.lock(tx, id);
      const updated = await this.cancelLocked(tx, subscription, actor.userId, reason, true);
      await recordAudit(tx, context, {
        action: 'subscription.cancelled_by_staff',
        entityType: 'subscription',
        entityId: id,
        previousValue: { status: subscription.status },
        newValue: { status: updated.status, reason },
      });
      return updated;
    });
  }

  // --- internals ------------------------------------------------------------------------

  private async processDue(
    tx: Executor,
    subscription: SubscriptionRow,
  ): Promise<'renewal' | 'expired' | 'cancelled' | 'none'> {
    const now = this.deps.now();
    if (subscription.status === 'ACTIVE' && subscription.cancelAtPeriodEnd) {
      await this.transition(tx, subscription, 'CANCELLED', 'CANCELLED', null, {
        cancelledAt: now,
        endedAt: now,
        nextBillingAt: null,
      });
      await tx.insert(schema.analyticsEvents).values({
        eventName: 'SUBSCRIPTION_CANCELLED',
        userId: subscription.userId,
        properties: { subscriptionId: subscription.id },
        occurredAt: now,
      });
      return 'cancelled';
    }

    const open = await this.currentCycleOrder(tx, subscription.id);
    if (subscription.status === 'ACTIVE') {
      if (open?.status === 'PENDING_PAYMENT') return 'none';
      const plan = await this.planFor(tx, subscription.pendingPlanId ?? subscription.planId);
      const [address] = subscription.shippingAddressId
        ? await tx
            .select()
            .from(schema.addresses)
            .where(eq(schema.addresses.id, subscription.shippingAddressId))
        : [];
      const previous = open ?? (await this.latestCycleOrder(tx, subscription.id));
      if (!address || !previous) {
        this.deps.logger.error('renewal skipped: no address or previous order', {
          subscriptionId: subscription.id,
        });
        return 'none';
      }
      const option = await this.deliveryOption(tx, previous.deliveryOptionCode);
      await this.createCycleOrder(tx, subscription, {
        planPriceAmount: plan.priceAmount,
        discountAmount: 0,
        shippingAmount: option.feeAmount,
        taxAmount: 0,
        deliveryOptionCode: option.code,
        idempotencyKey: `renewal:${subscription.id}:${subscription.nextBillingAt?.toISOString() ?? ''}`,
        address,
        actorId: null,
      });
      await this.transition(tx, subscription, 'PAST_DUE', 'RENEWAL_DUE', null, { renewalAttempts: 0 });
      return 'renewal';
    }

    // PAST_DUE beyond the grace period: the renewal order is cancelled and the subscription ends.
    const graceEnds = new Date(
      (subscription.nextBillingAt ?? now).getTime() + SUBSCRIPTION_POLICY.renewalGraceDays * 86_400_000,
    );
    if (now < graceEnds) return 'none';
    if (open?.status === 'PENDING_PAYMENT') {
      const [inProgress] = await tx
        .select({ id: schema.payments.id })
        .from(schema.payments)
        .where(
          and(
            eq(schema.payments.orderId, open.id),
            inArray(schema.payments.status, ['INITIATED', 'PENDING']),
          ),
        );
      if (inProgress) return 'none';
      await this.deps.orders.cancelUnpaid(tx, open, null, 'Renewal not paid within the grace period');
    }
    await this.transition(tx, await this.lock(tx, subscription.id), 'EXPIRED', 'EXPIRED', null, {
      endedAt: now,
      nextBillingAt: null,
    });
    return 'expired';
  }

  private async requestRenewalPayment(subscription: SubscriptionRow): Promise<void> {
    if (
      !subscription.paymentMethodId ||
      subscription.renewalAttempts >= SUBSCRIPTION_POLICY.maxRenewalAttempts
    )
      return;
    const { db } = this.deps;
    const order = await this.currentCycleOrder(db, subscription.id);
    if (order?.status !== 'PENDING_PAYMENT') return;
    const [last] = await db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.orderId, order.id))
      .orderBy(desc(schema.payments.initiatedAt))
      .limit(1);
    if (last && (last.status === 'INITIATED' || last.status === 'PENDING')) return;
    const waitMs = SUBSCRIPTION_POLICY.hoursBetweenRenewalAttempts * 3_600_000;
    if (last && this.deps.now().getTime() - last.initiatedAt.getTime() < waitMs) return;
    const [method] = await db
      .select()
      .from(schema.paymentMethods)
      .where(
        and(
          eq(schema.paymentMethods.id, subscription.paymentMethodId),
          isNull(schema.paymentMethods.deletedAt),
        ),
      );
    if (!method?.msisdn) return;

    await db
      .update(schema.subscriptions)
      .set({ renewalAttempts: subscription.renewalAttempts + 1 })
      .where(eq(schema.subscriptions.id, subscription.id));
    try {
      await this.deps.payments.startForOrder({
        userId: subscription.userId,
        orderId: order.id,
        provider: method.provider,
        msisdn: method.msisdn,
        idempotencyKey: `renewal-payment:${order.id}:${subscription.renewalAttempts + 1}`,
      });
    } catch (error) {
      this.deps.logger.warn('automatic renewal payment could not be requested', {
        subscriptionId: subscription.id,
        error,
      });
    }
  }

  private async resumeLocked(
    tx: Executor,
    subscription: SubscriptionRow,
    actorId: string | null,
  ): Promise<SubscriptionRow> {
    const now = this.deps.now();
    // Paused time is added to the period, so a pause never costs paid days.
    const pausedMs = subscription.pausedAt ? now.getTime() - subscription.pausedAt.getTime() : 0;
    const shift = (date: Date | null) => (date ? new Date(date.getTime() + pausedMs) : null);
    return this.transition(tx, subscription, 'ACTIVE', 'RESUMED', actorId, {
      pausedAt: null,
      resumeAt: null,
      currentPeriodEnd: shift(subscription.currentPeriodEnd),
      nextBillingAt: shift(subscription.nextBillingAt),
    });
  }

  private async cancelLocked(
    tx: Executor,
    subscription: SubscriptionRow,
    actorId: string,
    reason: string | null,
    immediately: boolean,
  ): Promise<SubscriptionRow> {
    const now = this.deps.now();
    if (subscription.status === 'ACTIVE' && !immediately) {
      if (subscription.cancelAtPeriodEnd) return subscription;
      const [updated] = await tx
        .update(schema.subscriptions)
        .set({ cancelAtPeriodEnd: true, cancellationReason: reason })
        .where(eq(schema.subscriptions.id, subscription.id))
        .returning();
      if (!updated) throw new Error('Subscription vanished');
      await this.recordEvent(tx, updated, 'CANCELLATION_SCHEDULED', 'ACTIVE', 'ACTIVE', actorId, { reason });
      return updated;
    }
    const open = await this.currentCycleOrder(tx, subscription.id);
    if (open?.status === 'PENDING_PAYMENT')
      await this.deps.orders.cancelUnpaid(tx, open, actorId, 'Subscription cancelled');
    const current = await this.lock(tx, subscription.id);
    if (current.status === 'CANCELLED' || current.status === 'EXPIRED') return current;
    const updated = await this.transition(tx, current, 'CANCELLED', 'CANCELLED', actorId, {
      cancelledAt: now,
      endedAt: now,
      cancellationReason: reason,
      nextBillingAt: null,
    });
    await tx.insert(schema.analyticsEvents).values({
      eventName: 'SUBSCRIPTION_CANCELLED',
      userId: subscription.userId,
      properties: { subscriptionId: subscription.id },
      occurredAt: now,
    });
    return updated;
  }

  /** Status change with lifecycle check and history; `to` null records an event without a status change. */
  private async transition(
    tx: Executor,
    subscription: SubscriptionRow,
    to: SubscriptionStatus | null,
    event: SubscriptionEventType,
    actorId: string | null,
    changes: Partial<typeof schema.subscriptions.$inferInsert> = {},
    metadata: Record<string, unknown> | null = null,
  ): Promise<SubscriptionRow> {
    if (to) subscriptionLifecycle.assertTransition(subscription.status, to);
    const [updated] = await tx
      .update(schema.subscriptions)
      .set({ ...changes, ...(to ? { status: to } : {}) })
      .where(eq(schema.subscriptions.id, subscription.id))
      .returning();
    if (!updated) throw new Error('Subscription vanished');
    await this.recordEvent(tx, updated, event, subscription.status, updated.status, actorId, metadata);
    return updated;
  }

  private async recordEvent(
    tx: Executor,
    subscription: SubscriptionRow,
    eventType: SubscriptionEventType,
    previousStatus: SubscriptionStatus | null,
    newStatus: SubscriptionStatus,
    actorId: string | null,
    metadata: Record<string, unknown> | null = null,
  ): Promise<void> {
    await tx.insert(schema.subscriptionEvents).values({
      subscriptionId: subscription.id,
      eventType,
      previousStatus,
      newStatus,
      actorId,
      metadata,
      createdAt: this.deps.now(),
    });
  }

  private async createCycleOrder(
    tx: Executor,
    subscription: SubscriptionRow,
    input: {
      planPriceAmount: number;
      discountAmount: number;
      shippingAmount: number;
      taxAmount: number;
      deliveryOptionCode: string;
      idempotencyKey: string;
      address: typeof schema.addresses.$inferSelect;
      actorId: string | null;
    },
  ): Promise<OrderRow> {
    const discount = Math.min(input.discountAmount, input.planPriceAmount + input.shippingAmount);
    const total = input.planPriceAmount - discount + input.shippingAmount + input.taxAmount;
    const order = await this.deps.orders.insertWithUniqueNumber(tx, {
      userId: subscription.userId,
      type: 'SUBSCRIPTION_CYCLE',
      status: 'PENDING_PAYMENT',
      subscriptionId: subscription.id,
      currency: this.deps.currency,
      subtotalAmount: input.planPriceAmount,
      discountAmount: discount,
      shippingAmount: input.shippingAmount,
      taxAmount: input.taxAmount,
      totalAmount: total,
      shippingAddressId: input.address.id,
      shippingAddress: {
        recipientName: input.address.recipientName,
        phone: input.address.phone,
        countryCode: input.address.countryCode,
        region: input.address.region,
        district: input.address.district,
        sector: input.address.sector,
        street: input.address.street,
        directions: input.address.directions,
      },
      deliveryOptionCode: input.deliveryOptionCode,
      idempotencyKey: input.idempotencyKey,
      placedAt: this.deps.now(),
    });
    await tx
      .insert(schema.orderStatusEvents)
      .values({ orderId: order.id, newStatus: 'PENDING_PAYMENT', actorId: input.actorId });
    await tx.insert(schema.analyticsEvents).values({
      eventName: 'ORDER_CREATED',
      userId: subscription.userId,
      properties: { orderId: order.id, type: 'SUBSCRIPTION_CYCLE' },
      occurredAt: this.deps.now(),
    });
    // A zero total (fully discounted) needs no payment.
    if (total === 0) return this.deps.orders.markPaid(tx, order, input.actorId);
    return order;
  }

  /** The newest cycle order that was not cancelled. */
  private async currentCycleOrder(db: Executor, subscriptionId: string): Promise<OrderRow | null> {
    const [order] = await db
      .select()
      .from(schema.orders)
      .where(and(eq(schema.orders.subscriptionId, subscriptionId), ne(schema.orders.status, 'CANCELLED')))
      .orderBy(desc(schema.orders.placedAt), desc(schema.orders.createdAt))
      .limit(1);
    return order ?? null;
  }

  private async latestCycleOrder(db: Executor, subscriptionId: string): Promise<OrderRow | null> {
    const [order] = await db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.subscriptionId, subscriptionId))
      .orderBy(desc(schema.orders.placedAt))
      .limit(1);
    return order ?? null;
  }

  /** 1 for the first cycle order, 2 for the first renewal, and so on (cancelled orders excluded). */
  private async cycleNumber(db: Executor, subscriptionId: string, orderId: string): Promise<number> {
    const rows = await db
      .select({ id: schema.orders.id })
      .from(schema.orders)
      .where(and(eq(schema.orders.subscriptionId, subscriptionId), ne(schema.orders.status, 'CANCELLED')))
      .orderBy(asc(schema.orders.placedAt), asc(schema.orders.createdAt));
    const index = rows.findIndex((row) => row.id === orderId);
    return index === -1 ? rows.length + 1 : index + 1;
  }

  private async subscriptionForOrderKey(
    db: Executor,
    userId: string,
    key: string,
  ): Promise<SubscriptionRow | null> {
    const [row] = await db
      .select({ subscription: schema.subscriptions })
      .from(schema.orders)
      .innerJoin(schema.subscriptions, eq(schema.subscriptions.id, schema.orders.subscriptionId))
      .where(and(eq(schema.orders.userId, userId), eq(schema.orders.idempotencyKey, key)));
    return row?.subscription ?? null;
  }

  private async activePlan(db: Executor, planId: string): Promise<PlanRow> {
    const [plan] = await db
      .select()
      .from(schema.subscriptionPlans)
      .where(
        and(
          eq(schema.subscriptionPlans.id, planId),
          eq(schema.subscriptionPlans.isActive, true),
          eq(schema.subscriptionPlans.marketCode, this.deps.marketCode),
        ),
      );
    if (!plan) throw new AppError('NOT_FOUND', 'Plan not found.');
    return plan;
  }

  private async planFor(db: Executor, planId: string): Promise<PlanRow> {
    const [plan] = await db
      .select()
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, planId));
    if (!plan) throw new Error(`Plan ${planId} missing`);
    return plan;
  }

  private async deliveryOption(db: Executor, code: string) {
    const [option] = await db
      .select()
      .from(schema.deliveryOptions)
      .where(
        and(
          eq(schema.deliveryOptions.code, code),
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
    return option;
  }

  private async lock(tx: Executor, id: string): Promise<SubscriptionRow> {
    const [row] = await tx
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.id, id))
      .for('update');
    if (!row) throw new AppError('NOT_FOUND', 'Subscription not found.');
    return row;
  }

  private async lockOwn(tx: Executor, userId: string, rawId: unknown): Promise<SubscriptionRow> {
    const parsed = z.uuid().safeParse(rawId);
    if (!parsed.success) throw new AppError('NOT_FOUND', 'Subscription not found.');
    const subscription = await this.lock(tx, parsed.data);
    if (subscription.userId !== userId) throw new AppError('NOT_FOUND', 'Subscription not found.');
    return subscription;
  }
}
