import { getMarket } from '@bambino/config';
import { type Database, type Executor, schema } from '@bambino/database';
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, sql } from '@bambino/database/orm';
import {
  PAYMENT_PROVIDERS,
  PAYMENT_REVIEW_RESOLUTIONS,
  type PaymentProviderCode,
  type PaymentReviewReason,
  type PaymentStatus,
} from '@bambino/types';
import { phoneSchema } from '@bambino/validation';
import { money, type CurrencyCode } from '@bambino/utils';
import { z } from 'zod';
import { paymentLifecycle } from '../domain/lifecycles';
import type { Logger } from '../infra/logger';
import type { RateLimiter } from '../infra/rate-limiter';
import type { EmailProvider } from '../providers/email';
import {
  type PaymentProviderRegistry,
  type ProviderPaymentStatus,
  requestNeverSent,
} from '../providers/payments';
import { recordAudit } from './audit-service';
import { type ServiceContext, requirePermission, requireUser } from './context';
import { AppError, isUniqueViolation, parseInput } from './errors';
import type { NotificationService } from './notification-service';
import type { OrderRow, OrderService } from './order-service';
import type { RefundService } from './refund-service';
import { type Page, type PageRequest, decodeOffset, encodeOffset, pageSize } from './pagination';

export type PaymentRow = typeof schema.payments.$inferSelect;
export type PaymentTransactionRow = typeof schema.paymentTransactions.$inferSelect;
export type PaymentMethodRow = typeof schema.paymentMethods.$inferSelect;
export type PaymentReviewRow = typeof schema.paymentReviews.$inferSelect;

/** Unanswered payments are re-checked with the provider after this long. */
export const RECONCILE_AFTER_MS = 2 * 60_000;
/** A payment whose request never had its answer recorded (the process stopped mid-call) is given up after this. */
export const INITIATION_TIMEOUT_MS = 15 * 60_000;
/**
 * Our own deadline (EXPIRED), a cancellation, or a failed request does not decide what the provider did: the
 * customer may still approve. These payments keep being checked with the provider for this long after they
 * started. If the provider still has no final answer by then, the payment goes to staff review.
 */
export const PROVIDER_WATCH_MS = 24 * 3_600_000;
/** How often reconciliation asks the provider about one payment it has stopped waiting for. */
const WATCH_POLICY = { limit: 1, windowMs: 10 * 60_000 };
const WATCHED_STATUSES = ['EXPIRED', 'CANCELLED', 'FAILED'] as const;

/** Closed on our side, but the provider's final answer is not recorded yet. */
function isWatched(payment: PaymentRow): boolean {
  return (
    (WATCHED_STATUSES as readonly string[]).includes(payment.status) &&
    payment.providerSettledAt === null &&
    payment.providerReference !== null
  );
}

const resolveReviewSchema = z.object({
  id: z.uuid(),
  resolution: z.enum(PAYMENT_REVIEW_RESOLUTIONS),
  note: z.string().trim().min(3).max(500),
});

/** Polling `payment(id)` asks the provider at most this often per payment. */
const POLL_POLICY = { limit: 1, windowMs: 3_000 };

const initiateSchema = z
  .object({
    idempotencyKey: z.string().trim().min(8).max(100),
    orderId: z.uuid(),
    provider: z.enum(PAYMENT_PROVIDERS),
    msisdn: phoneSchema.nullish(),
    paymentMethodId: z.uuid().nullish(),
  })
  .refine((input) => input.msisdn || input.paymentMethodId, {
    message: 'validation.payment.wallet_required',
    path: ['msisdn'],
  });

const paymentMethodSchema = z.object({
  provider: z.enum(PAYMENT_PROVIDERS),
  msisdn: phoneSchema,
  label: z.string().trim().max(40).nullish(),
  isDefault: z.boolean().nullish(),
});

/** Customer-facing wording per failure; provider messages are never shown. */
const FAILURE_MESSAGES: Record<string, string> = {
  DECLINED: 'The payment was declined. Please try again or choose another payment method.',
  EXPIRED: 'The payment request expired before it was approved. Please try again.',
};
const DEFAULT_FAILURE = 'Payment could not be completed. Please try again or choose another payment method.';

export function customerFailureMessage(code: string | null): string | null {
  return code ? (FAILURE_MESSAGES[code] ?? DEFAULT_FAILURE) : null;
}

export interface PaymentServiceDependencies {
  db: Database;
  providers: PaymentProviderRegistry;
  orders: OrderService;
  notifications: NotificationService;
  rateLimiter: RateLimiter;
  logger: Logger;
  marketCode: string;
  currency: CurrencyCode;
  allowMockProvider: boolean;
  /** Tells staff by email when a payment needs review. Without it only the in-app notification is written. */
  email?: EmailProvider;
  adminOrigin?: string;
  now: () => Date;
}

/**
 * Collects money for orders. A payment only ever becomes SUCCEEDED from the provider's own
 * status answer (reached by polling, webhook or reconciliation), inside one transaction that
 * also marks the order paid. Applying the same answer twice changes nothing.
 */
export class PaymentService {
  private refunds: RefundService | null = null;

  constructor(private readonly deps: PaymentServiceDependencies) {}

  /** Refund webhooks arrive on the same endpoint as payment webhooks. */
  attachRefunds(refunds: RefundService): void {
    this.refunds = refunds;
  }

  async initiate(context: ServiceContext, rawInput: unknown): Promise<PaymentRow> {
    const actor = requireUser(context);
    const input = parseInput(initiateSchema, rawInput);
    const msisdn =
      input.msisdn ?? (await this.ownPaymentMethodMsisdn(actor.userId, input.paymentMethodId ?? ''));
    return this.startForOrder({
      userId: actor.userId,
      orderId: input.orderId,
      provider: input.provider,
      msisdn,
      idempotencyKey: input.idempotencyKey,
    });
  }

  /**
   * Starts collecting an order's stored total. Used by customers (through `initiate`) and by
   * the renewal job for saved wallets. Re-using a key returns the payment it created.
   */
  async startForOrder(input: {
    userId: string;
    orderId: string;
    provider: PaymentProviderCode;
    msisdn: string;
    idempotencyKey: string;
  }): Promise<PaymentRow> {
    const { db, now } = this.deps;
    this.providerFor(input.provider); // refuses a provider that is not integrated or offered

    const [existing] = await db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.idempotencyKey, input.idempotencyKey));
    if (existing) {
      if (existing.userId !== input.userId || existing.orderId !== input.orderId) {
        throw new AppError(
          'CONFLICT',
          'This request key was already used for something else.',
          'IDEMPOTENCY_KEY_REUSED',
        );
      }
      return existing;
    }

    let payment: PaymentRow;
    try {
      payment = await db.transaction(async (tx) => {
        const order = await this.deps.orders.lockOrder(tx, input.orderId);
        if (!order || order.userId !== input.userId) throw new AppError('NOT_FOUND', 'Order not found.');
        if (order.status !== 'PENDING_PAYMENT' || order.totalAmount <= 0) {
          throw new AppError('CONFLICT', 'This order does not need a payment.', 'ORDER_NOT_PAYABLE');
        }
        if (order.type === 'EXCHANGE_REPLACEMENT') {
          const [exchange] = await tx
            .select({ status: schema.exchanges.status })
            .from(schema.exchanges)
            .where(eq(schema.exchanges.replacementOrderId, order.id));
          if (exchange?.status !== 'APPROVED') {
            throw new AppError(
              'CONFLICT',
              'This exchange has not been approved yet.',
              'EXCHANGE_NOT_APPROVED',
            );
          }
        }
        const [open] = await tx
          .select()
          .from(schema.payments)
          .where(
            and(
              eq(schema.payments.orderId, order.id),
              inArray(schema.payments.status, ['INITIATED', 'PENDING']),
            ),
          );
        if (open)
          throw new AppError(
            'CONFLICT',
            'A payment for this order is already waiting for approval.',
            'PAYMENT_IN_PROGRESS',
          );

        const [created] = await tx
          .insert(schema.payments)
          .values({
            userId: input.userId,
            orderId: order.id,
            subscriptionId: order.subscriptionId,
            provider: input.provider,
            status: 'INITIATED',
            amount: order.totalAmount,
            currency: order.currency,
            idempotencyKey: input.idempotencyKey,
            payerMsisdn: input.msisdn,
            initiatedAt: now(),
          })
          .returning();
        if (!created) throw new Error('Payment insert returned no row');
        await tx.insert(schema.analyticsEvents).values({
          eventName: 'PAYMENT_INITIATED',
          userId: input.userId,
          properties: { paymentId: created.id, provider: input.provider },
          occurredAt: now(),
        });
        return created;
      });
    } catch (error) {
      if (isUniqueViolation(error, 'payments_idempotency_key_uq')) {
        const [winner] = await db
          .select()
          .from(schema.payments)
          .where(eq(schema.payments.idempotencyKey, input.idempotencyKey));
        if (winner?.userId === input.userId) return winner;
      }
      throw error;
    }

    // The provider call happens outside the transaction; its outcome is recorded either way.
    return this.collectFromProvider(payment, input.provider, input.msisdn);
  }

  /** Asks the wallet for the payment and records the outcome, success or failure, in the payment's history. */
  private async collectFromProvider(
    payment: PaymentRow,
    providerCode: PaymentProviderCode,
    msisdn: string,
  ): Promise<PaymentRow> {
    const provider = this.providerFor(providerCode);
    try {
      const result = await provider.initiate({
        reference: payment.idempotencyKey,
        amount: money(payment.amount, this.deps.currency),
        payerMsisdn: msisdn,
        description: 'Bambino order',
      });
      return await this.applyTransition(payment.id, 'PENDING', 'INITIATION', {
        providerReference: result.providerReference,
        expiresAt: result.expiresAt,
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.deps.logger.error('payment initiation failed at provider', {
        paymentId: payment.id,
        provider: providerCode,
        error,
      });
      // Certainly never sent (or refused outright): nothing can have been collected, so the payment is closed.
      if (requestNeverSent(error)) {
        return this.applyTransition(payment.id, 'FAILED', 'INITIATION', {
          failureCode: 'PROVIDER_ERROR',
          settled: true,
        });
      }
      // Ambiguous: a timeout, a dropped connection or a lost response. The provider may have the request and the
      // customer may approve it. Where its reference can be derived the payment stays watched; where it cannot,
      // nothing could ever check it, so a person has to.
      const reference = provider.referenceFor?.(payment.idempotencyKey);
      return this.applyTransition(payment.id, 'FAILED', 'INITIATION', {
        failureCode: 'PROVIDER_ERROR',
        ...(reference
          ? { providerReference: reference }
          : { settled: true, review: 'OUTCOME_UNCONFIRMED' as const }),
      });
    }
  }

  /**
   * Pay on delivery: the courier is at the door, so staff ask the customer's chosen wallet for the order's total.
   * The customer approves with their PIN; the result arrives like any other payment (webhook, polling, reconciliation)
   * and sets `paidAt` without changing the order's status. Asking again while a request is waiting returns it; after a
   * failed or expired request a new one can be sent. There is no cash.
   */
  async requestAtDoor(context: ServiceContext, rawOrderId: unknown): Promise<PaymentRow> {
    requirePermission(context, 'order:write');
    const orderId = parseInput(z.uuid(), rawOrderId);
    const { db, now } = this.deps;

    const prepared = await db
      .transaction(async (tx) => {
        const order = await this.deps.orders.lockOrder(tx, orderId);
        if (!order) throw new AppError('NOT_FOUND', 'Order not found.');
        if (!order.payOnDeliveryProvider || !order.payOnDeliveryMsisdn) {
          throw new AppError('CONFLICT', 'This order is not paid on delivery.', 'NOT_PAY_ON_DELIVERY');
        }
        if (order.paidAt) throw new AppError('CONFLICT', 'This order is already paid.', 'ALREADY_PAID');
        if (order.status !== 'OUT_FOR_DELIVERY') {
          throw new AppError(
            'CONFLICT',
            'Ask for payment once the order is out for delivery and the courier is at the door.',
            'ORDER_NOT_AT_DOOR',
          );
        }
        this.providerFor(order.payOnDeliveryProvider);

        const [open] = await tx
          .select()
          .from(schema.payments)
          .where(
            and(
              eq(schema.payments.orderId, order.id),
              inArray(schema.payments.status, ['INITIATED', 'PENDING']),
            ),
          );
        if (open) return { existing: open } as const;

        const [attempts] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(schema.payments)
          .where(eq(schema.payments.orderId, order.id));
        const [created] = await tx
          .insert(schema.payments)
          .values({
            userId: order.userId,
            orderId: order.id,
            subscriptionId: order.subscriptionId,
            provider: order.payOnDeliveryProvider,
            status: 'INITIATED',
            amount: order.totalAmount,
            currency: order.currency,
            idempotencyKey: `door:${order.id}:${(attempts?.n ?? 0) + 1}`,
            payerMsisdn: order.payOnDeliveryMsisdn,
            initiatedAt: now(),
          })
          .returning();
        if (!created) throw new Error('Payment insert returned no row');
        await tx.insert(schema.analyticsEvents).values({
          eventName: 'DOOR_PAYMENT_REQUESTED',
          userId: order.userId,
          properties: { paymentId: created.id, provider: created.provider },
          occurredAt: now(),
        });
        await recordAudit(tx, context, {
          action: 'payment.door_requested',
          entityType: 'order',
          entityId: order.id,
          newValue: { paymentId: created.id },
        });
        return { created, provider: order.payOnDeliveryProvider, msisdn: order.payOnDeliveryMsisdn } as const;
      })
      .catch(async (error: unknown) => {
        if (isUniqueViolation(error, 'payments_idempotency_key_uq')) {
          const [winner] = await db
            .select()
            .from(schema.payments)
            .where(
              and(
                eq(schema.payments.orderId, orderId),
                inArray(schema.payments.status, ['INITIATED', 'PENDING']),
              ),
            );
          if (winner) return { existing: winner } as const;
        }
        throw error;
      });

    if ('existing' in prepared) return prepared.existing;
    return this.collectFromProvider(prepared.created, prepared.provider, prepared.msisdn);
  }

  /** The wallets a customer can choose for pay on delivery: offered here and really integrated. */
  doorProviders(): PaymentProviderCode[] {
    return (['MTN_MOMO', 'AIRTEL_MONEY', 'MOCK'] as const).filter(
      (code) => this.deps.providers.has(code) && this.isOffered(code),
    );
  }

  /** Customer view of a payment. While pending, asks the provider (throttled) so polling clients see the outcome. */
  async getOwn(context: ServiceContext, rawId: unknown): Promise<PaymentRow | null> {
    const actor = requireUser(context);
    const parsed = z.uuid().safeParse(rawId);
    if (!parsed.success) return null;
    const [payment] = await this.deps.db
      .select()
      .from(schema.payments)
      .where(and(eq(schema.payments.id, parsed.data), eq(schema.payments.userId, actor.userId)));
    if (!payment) return null;
    if (
      payment.status === 'PENDING' &&
      (await this.deps.rateLimiter.consume(`payment-poll:${payment.id}`, POLL_POLICY))
    ) {
      return this.refreshFromProvider(payment.id, 'STATUS_CHECK');
    }
    return payment;
  }

  async forOrders(orderIds: readonly string[]): Promise<PaymentRow[]> {
    if (orderIds.length === 0) return [];
    return this.deps.db
      .select()
      .from(schema.payments)
      .where(inArray(schema.payments.orderId, [...orderIds]))
      .orderBy(asc(schema.payments.initiatedAt));
  }

  /**
   * Webhook entry point. The event is stored first under a unique key, so a replay stops
   * there. A valid event only triggers a status check: the body itself is not trusted.
   */
  async handleWebhook(providerCode: string, headers: Headers, body: string): Promise<{ status: number }> {
    const code = providerCode.toUpperCase() as PaymentProviderCode;
    const provider = this.deps.providers.get(code);
    if (!provider) return { status: 404 };

    let parsed;
    try {
      parsed = provider.parseWebhook(headers, body);
    } catch {
      return { status: 400 };
    }

    // An unsigned event is refused before it is stored: otherwise a forged event could take the real event's id,
    // and the real one would then be dropped as a replay.
    if (!parsed.signatureValid) {
      this.deps.logger.warn('webhook with invalid signature ignored', {
        provider: code,
        eventId: parsed.eventId,
      });
      return { status: 401 };
    }

    const [stored] = await this.deps.db
      .insert(schema.webhookEvents)
      .values({
        provider: code,
        providerEventId: parsed.eventId,
        signatureValid: parsed.signatureValid,
        payload: parsed.payload,
      })
      .onConflictDoNothing()
      .returning();
    if (!stored) return { status: 200 }; // replay: already received

    const [payment] = await this.deps.db
      .select()
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.provider, code),
          eq(schema.payments.providerReference, parsed.providerReference),
        ),
      );
    let processingError: string | null = null;
    if (payment) {
      try {
        await this.refreshFromProvider(payment.id, 'WEBHOOK');
      } catch (error) {
        processingError = error instanceof Error ? error.message : String(error);
        this.deps.logger.error('webhook processing failed', { paymentId: payment.id, error });
      }
    } else {
      try {
        const isRefund = (await this.refunds?.refreshByProviderReference(parsed.providerReference)) ?? false;
        if (!isRefund) processingError = 'No payment or refund with this provider reference';
      } catch (error) {
        processingError = error instanceof Error ? error.message : String(error);
        this.deps.logger.error('refund webhook processing failed', { error });
      }
    }
    await this.deps.db
      .update(schema.webhookEvents)
      .set({ processedAt: this.deps.now(), processingError })
      .where(eq(schema.webhookEvents.id, stored.id));
    return { status: 200 };
  }

  /** Re-checks unresolved payments with their providers and expires those past their deadline. */
  async reconcile(): Promise<{ checked: number; expired: number }> {
    const cutoff = new Date(this.deps.now().getTime() - RECONCILE_AFTER_MS);
    const open = await this.deps.db
      .select()
      .from(schema.payments)
      .where(
        and(
          inArray(schema.payments.status, ['INITIATED', 'PENDING']),
          lt(schema.payments.initiatedAt, cutoff),
        ),
      )
      .limit(200);
    // Closed on our side but not yet answered by the provider: a late approval must not be missed.
    const watched = await this.deps.db
      .select()
      .from(schema.payments)
      .where(
        and(
          inArray(schema.payments.status, [...WATCHED_STATUSES]),
          isNull(schema.payments.providerSettledAt),
          isNotNull(schema.payments.providerReference),
          lt(schema.payments.initiatedAt, cutoff),
        ),
      )
      .orderBy(asc(schema.payments.initiatedAt))
      .limit(200);
    const unresolved = [...open, ...watched];
    let expired = 0;
    for (const payment of unresolved) {
      // One payment the provider cannot answer for must not stop the others, or the jobs that run after this one.
      try {
        const after = await this.refreshFromProvider(payment.id, 'RECONCILIATION');
        if (after.status === 'EXPIRED') expired += 1;
      } catch (error) {
        this.deps.logger.error('payment reconciliation failed', { paymentId: payment.id, error });
      }
    }
    return { checked: unresolved.length, expired };
  }

  async reconcileOne(context: ServiceContext, rawId: unknown): Promise<PaymentRow> {
    requirePermission(context, 'payment:write');
    const id = parseInput(z.uuid(), rawId);
    const [payment] = await this.deps.db.select().from(schema.payments).where(eq(schema.payments.id, id));
    if (!payment) throw new AppError('NOT_FOUND', 'Payment not found.');
    // Asked by a person: the provider is consulted even after the automatic watch has ended.
    const result = await this.refreshFromProvider(id, 'STATUS_CHECK', true);
    await this.deps.db.transaction((tx) =>
      recordAudit(tx, context, {
        action: 'payment.reconciled',
        entityType: 'payment',
        entityId: id,
        previousValue: { status: payment.status },
        newValue: { status: result.status },
      }),
    );
    return result;
  }

  async listForStaff(
    context: ServiceContext,
    status: PaymentStatus | null | undefined,
    request: PageRequest,
  ): Promise<Page<PaymentRow> & { totalCount: number }> {
    requirePermission(context, 'payment:read');
    const size = pageSize(request);
    const offset = decodeOffset(request.after);
    const where = status ? eq(schema.payments.status, status) : undefined;
    const rows = await this.deps.db
      .select()
      .from(schema.payments)
      .where(where)
      .orderBy(desc(schema.payments.initiatedAt), desc(schema.payments.id))
      .limit(size + 1)
      .offset(offset);
    const [count] = await this.deps.db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.payments)
      .where(where);
    const items = rows.slice(0, size);
    return {
      items,
      hasNextPage: rows.length > size,
      endCursor: items.length ? encodeOffset(offset + items.length) : null,
      totalCount: count?.n ?? 0,
    };
  }

  async transactionsFor(paymentIds: readonly string[]): Promise<PaymentTransactionRow[]> {
    if (paymentIds.length === 0) return [];
    return this.deps.db
      .select()
      .from(schema.paymentTransactions)
      .where(inArray(schema.paymentTransactions.paymentId, [...paymentIds]))
      .orderBy(asc(schema.paymentTransactions.createdAt));
  }

  // --- saved payment methods ----------------------------------------------------

  async listMethods(context: ServiceContext): Promise<PaymentMethodRow[]> {
    const actor = requireUser(context);
    return this.deps.db
      .select()
      .from(schema.paymentMethods)
      .where(and(eq(schema.paymentMethods.userId, actor.userId), isNull(schema.paymentMethods.deletedAt)))
      .orderBy(desc(schema.paymentMethods.isDefault), asc(schema.paymentMethods.createdAt));
  }

  async addMethod(context: ServiceContext, rawInput: unknown): Promise<PaymentMethodRow> {
    const actor = requireUser(context);
    const input = parseInput(paymentMethodSchema, rawInput);
    this.assertProviderOffered(input.provider);
    return this.deps.db.transaction(async (tx) => {
      if (input.isDefault) {
        await tx
          .update(schema.paymentMethods)
          .set({ isDefault: false })
          .where(eq(schema.paymentMethods.userId, actor.userId));
      }
      const [row] = await tx
        .insert(schema.paymentMethods)
        .values({
          userId: actor.userId,
          provider: input.provider,
          msisdn: input.msisdn,
          label: input.label ?? null,
          isDefault: input.isDefault ?? false,
        })
        .returning();
      if (!row) throw new Error('Payment method insert returned no row');
      return row;
    });
  }

  async removeMethod(context: ServiceContext, rawId: unknown): Promise<void> {
    const actor = requireUser(context);
    const parsed = z.uuid().safeParse(rawId);
    if (!parsed.success) throw new AppError('NOT_FOUND', 'Payment method not found.');
    const rows = await this.deps.db
      .update(schema.paymentMethods)
      .set({ deletedAt: this.deps.now(), isDefault: false })
      .where(
        and(
          eq(schema.paymentMethods.id, parsed.data),
          eq(schema.paymentMethods.userId, actor.userId),
          isNull(schema.paymentMethods.deletedAt),
        ),
      )
      .returning({ id: schema.paymentMethods.id });
    if (rows.length === 0) throw new AppError('NOT_FOUND', 'Payment method not found.');
  }

  // --- internals --------------------------------------------------------------

  /** Asks the provider for the payment's status and applies the answer. Expires payments past their deadline. */
  private async refreshFromProvider(
    paymentId: string,
    source: 'STATUS_CHECK' | 'WEBHOOK' | 'RECONCILIATION',
    /** Ask the provider about a closed payment even when the automatic watch is over (staff asked). */
    force = false,
  ): Promise<PaymentRow> {
    const [found] = await this.deps.db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.id, paymentId));
    if (!found) throw new AppError('NOT_FOUND', 'Payment not found.');
    const closed = (WATCHED_STATUSES as readonly string[]).includes(found.status);
    if (isWatched(found) || (force && closed && found.providerReference)) {
      return this.recheckClosed(found, source);
    }
    if (found.status !== 'PENDING' && found.status !== 'INITIATED') return found;
    let payment = found;
    const provider = this.deps.providers.get(payment.provider);

    // The request was sent (or about to be) but its answer was never recorded: the process stopped mid-call.
    if (payment.status === 'INITIATED' && !payment.providerReference) {
      const deadline = new Date(payment.initiatedAt.getTime() + INITIATION_TIMEOUT_MS);
      const reference = provider?.referenceFor?.(payment.idempotencyKey);
      if (reference) {
        // The provider may have the request, and the customer may have approved it: record it and ask as usual.
        payment = await this.applyTransition(paymentId, 'PENDING', source, {
          providerReference: reference,
          expiresAt: deadline,
        });
        if (payment.status !== 'PENDING') return payment;
      } else if (deadline <= this.deps.now()) {
        // Nobody knows whether the request went out, and nothing can look it up: a person has to.
        return this.applyTransition(paymentId, 'FAILED', source, {
          failureCode: 'EXPIRED',
          settled: true,
          review: 'OUTCOME_UNCONFIRMED',
        });
      } else {
        return payment;
      }
    }

    let answer: ProviderPaymentStatus = { status: 'PENDING' };
    if (payment.providerReference && provider) {
      answer = await provider.getStatus(payment.providerReference, money(payment.amount, this.deps.currency));
    }

    if (answer.status === 'SUCCEEDED') return this.applyTransition(paymentId, 'SUCCEEDED', source, {});
    if (answer.status === 'FAILED')
      return this.applyTransition(paymentId, 'FAILED', source, {
        failureCode: answer.failureCode,
        settled: true,
      });
    if (payment.expiresAt && payment.expiresAt <= this.deps.now()) {
      return this.applyTransition(paymentId, payment.status === 'INITIATED' ? 'FAILED' : 'EXPIRED', source, {
        failureCode: 'EXPIRED',
      });
    }
    return payment;
  }

  /**
   * A payment we stopped waiting for (expired, cancelled, or its request failed). Our deadline is not the provider's:
   * the customer may still approve it. So the provider is asked until it gives a final answer, and if it never does
   * within PROVIDER_WATCH_MS the payment is handed to staff. Nothing here trusts anything but the provider's answer.
   */
  private async recheckClosed(
    payment: PaymentRow,
    source: 'STATUS_CHECK' | 'WEBHOOK' | 'RECONCILIATION',
  ): Promise<PaymentRow> {
    const provider = this.deps.providers.get(payment.provider);
    if (!provider || !payment.providerReference) return payment;
    const watchOver = payment.initiatedAt.getTime() + PROVIDER_WATCH_MS <= this.deps.now().getTime();
    if (
      source === 'RECONCILIATION' &&
      !watchOver &&
      !(await this.deps.rateLimiter.consume(`payment-watch:${payment.id}`, WATCH_POLICY))
    ) {
      return payment;
    }
    const answer = await provider.getStatus(
      payment.providerReference,
      money(payment.amount, this.deps.currency),
    );
    if (answer.status === 'SUCCEEDED') return this.applyTransition(payment.id, 'SUCCEEDED', source, {});
    if (answer.status === 'FAILED') return this.settle(payment.id, source, 'FAILED', null);
    if (!watchOver) return payment;
    // Still no final answer after the whole watch. Even "no such request" is not proof that nothing was collected
    // (the request may have been sent and the answer lost), so a person checks the provider account.
    return this.settle(
      payment.id,
      source,
      answer.unknown ? 'NOT_FOUND' : 'UNCONFIRMED',
      'OUTCOME_UNCONFIRMED',
    );
  }

  /** Records that a closed payment needs no more provider checks, and opens a staff review when one is due. */
  private async settle(
    paymentId: string,
    source: 'STATUS_CHECK' | 'WEBHOOK' | 'RECONCILIATION',
    providerOutcome: 'FAILED' | 'NOT_FOUND' | 'UNCONFIRMED',
    reviewReason: PaymentReviewReason | null,
  ): Promise<PaymentRow> {
    const { db, now } = this.deps;
    const result = await db.transaction(async (tx) => {
      const [payment] = await tx
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.id, paymentId))
        .for('update');
      if (!payment) throw new AppError('NOT_FOUND', 'Payment not found.');
      if (!isWatched(payment)) return { row: payment, reviewId: null };
      const [updated] = await tx
        .update(schema.payments)
        .set({ providerSettledAt: now() })
        .where(eq(schema.payments.id, paymentId))
        .returning();
      if (!updated) throw new Error('Payment vanished during update');
      await tx.insert(schema.paymentTransactions).values({
        paymentId,
        type: source,
        resultingStatus: payment.status,
        amount: payment.amount,
        currency: payment.currency,
        providerReference: payment.providerReference,
        payload: { providerOutcome },
      });
      const reviewId = reviewReason ? await this.openReview(tx, updated, reviewReason) : null;
      return { row: updated, reviewId };
    });
    if (result.reviewId) await this.alertStaff(result.reviewId);
    return result.row;
  }

  /**
   * Moves a payment to a new status with its consequences, in one transaction under a row
   * lock. If another process already moved it, the lifecycle refuses and the current row is returned, so applying
   * the same provider answer again changes nothing: no second stock deduction, delivery, notification or review.
   */
  private async applyTransition(
    paymentId: string,
    to: PaymentStatus,
    source: 'INITIATION' | 'STATUS_CHECK' | 'WEBHOOK' | 'RECONCILIATION',
    changes: {
      providerReference?: string;
      expiresAt?: Date | null;
      failureCode?: string;
      /** The provider gave its final answer, so the payment needs no more checks. Success always is one. */
      settled?: boolean;
      /** Opens a staff review with this reason in the same transaction. */
      review?: PaymentReviewReason;
    },
  ): Promise<PaymentRow> {
    const { db, now } = this.deps;
    const result = await db.transaction(async (tx) => {
      const [payment] = await tx
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.id, paymentId))
        .for('update');
      if (!payment) throw new AppError('NOT_FOUND', 'Payment not found.');
      if (!paymentLifecycle.canTransition(payment.status, to)) return { row: payment, reviewId: null };

      // Decided before the row changes: can the order still take this money? An order awaiting payment still holds
      // its stock; a cancelled one has released it and an already paid one has used it. Those are never fulfilled
      // from here: the money is recorded as received but unapplied, and a person reviews it.
      let order: OrderRow | null = null;
      let reviewReason: PaymentReviewReason | null = null;
      if (to === 'SUCCEEDED' && payment.orderId) {
        order = await this.deps.orders.lockOrder(tx, payment.orderId);
        const awaiting = order?.status === 'PENDING_PAYMENT';
        const atDoor =
          Boolean(order?.payOnDeliveryProvider) && !order?.paidAt && order?.status === 'OUT_FOR_DELIVERY';
        if (!awaiting && !atDoor) {
          reviewReason = order?.status === 'CANCELLED' ? 'ORDER_CANCELLED' : 'ORDER_NOT_AWAITING_PAYMENT';
        }
      }

      const final = to === 'SUCCEEDED' || to === 'FAILED' || to === 'EXPIRED' || to === 'CANCELLED';
      const settled = to === 'SUCCEEDED' || changes.settled === true;
      const [updated] = await tx
        .update(schema.payments)
        .set({
          status: to,
          ...(changes.providerReference ? { providerReference: changes.providerReference } : {}),
          ...(changes.expiresAt !== undefined ? { expiresAt: changes.expiresAt } : {}),
          ...(changes.failureCode ? { failureCode: changes.failureCode } : {}),
          // A late approval replaces the reason we had given up for: the payment did go through.
          ...(to === 'SUCCEEDED' ? { failureCode: null } : {}),
          ...(final ? { completedAt: now() } : {}),
          ...(settled ? { providerSettledAt: now() } : {}),
          ...(reviewReason ? { unapplied: true } : {}),
        })
        .where(eq(schema.payments.id, paymentId))
        .returning();
      if (!updated) throw new Error('Payment vanished during update');
      await tx.insert(schema.paymentTransactions).values({
        paymentId,
        type: source,
        resultingStatus: to,
        amount: payment.amount,
        currency: payment.currency,
        providerReference: changes.providerReference ?? payment.providerReference,
        payload: changes.failureCode
          ? { failureCode: changes.failureCode }
          : reviewReason
            ? { unapplied: reviewReason, previousStatus: payment.status }
            : null,
      });

      let reviewId: string | null = null;
      if (to === 'SUCCEEDED') reviewId = await this.onSucceeded(tx, updated, order, reviewReason);
      if (to === 'FAILED' || to === 'EXPIRED') {
        await this.deps.notifications.notify(tx, payment.userId, 'PAYMENT_FAILED', {});
      }
      if (changes.review) reviewId = await this.openReview(tx, updated, changes.review);
      return { row: updated, reviewId };
    });
    if (result.reviewId) await this.alertStaff(result.reviewId);
    return result.row;
  }

  /** What follows money arriving. Returns the id of the review it opened, if the order could not take the money. */
  private async onSucceeded(
    tx: Executor,
    payment: PaymentRow,
    order: OrderRow | null,
    reviewReason: PaymentReviewReason | null,
  ): Promise<string | null> {
    await tx.insert(schema.analyticsEvents).values({
      eventName: 'PAYMENT_COMPLETED',
      userId: payment.userId,
      properties: { paymentId: payment.id, provider: payment.provider, amount: payment.amount },
      occurredAt: this.deps.now(),
    });
    if (reviewReason) {
      this.deps.logger.error('payment received for an order that cannot take it; staff review opened', {
        paymentId: payment.id,
        orderId: payment.orderId,
        orderStatus: order?.status,
        reason: reviewReason,
      });
      return this.openReview(tx, payment, reviewReason);
    }
    await this.deps.notifications.notify(tx, payment.userId, 'PAYMENT_SUCCEEDED', {});
    if (!order) return null;
    if (order.status === 'PENDING_PAYMENT') {
      await this.deps.orders.markPaid(tx, order, null);
    } else {
      // Paid at the door: the order is already on its way, so only the paid time is recorded.
      await tx.update(schema.orders).set({ paidAt: this.deps.now() }).where(eq(schema.orders.id, order.id));
    }
    return null;
  }

  // --- staff review -------------------------------------------------------------

  /** Opens the one review a payment can have and tells payment staff. A repeat opens nothing and tells nobody. */
  private async openReview(
    tx: Executor,
    payment: PaymentRow,
    reason: PaymentReviewReason,
  ): Promise<string | null> {
    const [created] = await tx
      .insert(schema.paymentReviews)
      .values({ paymentId: payment.id, orderId: payment.orderId, reason })
      .onConflictDoNothing()
      .returning({ id: schema.paymentReviews.id });
    if (!created) return null;
    for (const staff of await this.paymentStaff(tx)) {
      await this.deps.notifications.notify(tx, staff.id, 'PAYMENT_REVIEW_REQUIRED', {
        paymentId: payment.id,
      });
    }
    return created.id;
  }

  /** Active staff whose role lets them act on payments. */
  private async paymentStaff(db: Executor): Promise<{ id: string; email: string | null }[]> {
    return db
      .selectDistinct({ id: schema.users.id, email: schema.users.email })
      .from(schema.users)
      .innerJoin(schema.userRoles, eq(schema.userRoles.userId, schema.users.id))
      .innerJoin(schema.rolePermissions, eq(schema.rolePermissions.roleId, schema.userRoles.roleId))
      .innerJoin(schema.permissions, eq(schema.permissions.id, schema.rolePermissions.permissionId))
      .where(and(eq(schema.permissions.key, 'payment:write'), eq(schema.users.status, 'ACTIVE')));
  }

  /** Emails payment staff after the review is saved. A failed email never undoes the review. */
  private async alertStaff(reviewId: string): Promise<void> {
    const { email, adminOrigin } = this.deps;
    if (!email) return;
    try {
      for (const staff of await this.paymentStaff(this.deps.db)) {
        if (!staff.email) continue;
        await email.send({
          to: staff.email,
          template: 'staff.payment_review',
          locale: 'en',
          params: adminOrigin ? { link: `${adminOrigin}/admin/payments` } : {},
        });
      }
    } catch (error) {
      this.deps.logger.error('payment review email failed', { reviewId, error });
    }
  }

  async listReviews(
    context: ServiceContext,
    open: boolean | null | undefined,
    request: PageRequest,
  ): Promise<Page<PaymentReviewRow> & { totalCount: number }> {
    requirePermission(context, 'payment:read');
    const size = pageSize(request);
    const offset = decodeOffset(request.after);
    const where =
      open === null || open === undefined
        ? undefined
        : open
          ? isNull(schema.paymentReviews.resolvedAt)
          : isNotNull(schema.paymentReviews.resolvedAt);
    const rows = await this.deps.db
      .select()
      .from(schema.paymentReviews)
      .where(where)
      .orderBy(desc(schema.paymentReviews.createdAt), desc(schema.paymentReviews.id))
      .limit(size + 1)
      .offset(offset);
    const [count] = await this.deps.db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.paymentReviews)
      .where(where);
    const items = rows.slice(0, size);
    return {
      items,
      hasNextPage: rows.length > size,
      endCursor: items.length ? encodeOffset(offset + items.length) : null,
      totalCount: count?.n ?? 0,
    };
  }

  /** Staff record how a review ended. It changes no payment or order: refunds go through the refund flow. */
  async resolveReview(context: ServiceContext, rawInput: unknown): Promise<PaymentReviewRow> {
    requirePermission(context, 'payment:write');
    const actor = requireUser(context);
    const input = parseInput(resolveReviewSchema, rawInput);
    return this.deps.db.transaction(async (tx) => {
      const [review] = await tx
        .select()
        .from(schema.paymentReviews)
        .where(eq(schema.paymentReviews.id, input.id))
        .for('update');
      if (!review) throw new AppError('NOT_FOUND', 'Payment review not found.');
      if (review.resolvedAt) {
        throw new AppError('CONFLICT', 'This review is already resolved.', 'REVIEW_ALREADY_RESOLVED');
      }
      const [updated] = await tx
        .update(schema.paymentReviews)
        .set({
          resolution: input.resolution,
          resolutionNote: input.note,
          resolvedBy: actor.userId,
          resolvedAt: this.deps.now(),
        })
        .where(eq(schema.paymentReviews.id, review.id))
        .returning();
      if (!updated) throw new Error('Payment review vanished during update');
      await recordAudit(tx, context, {
        action: 'payment.review_resolved',
        entityType: 'payment',
        entityId: review.paymentId,
        previousValue: { reason: review.reason },
        newValue: { resolution: input.resolution, note: input.note },
      });
      return updated;
    });
  }

  async byIds(ids: readonly string[]): Promise<PaymentRow[]> {
    if (ids.length === 0) return [];
    return this.deps.db
      .select()
      .from(schema.payments)
      .where(inArray(schema.payments.id, [...ids]));
  }

  private providerFor(code: PaymentProviderCode) {
    this.assertProviderOffered(code);
    const provider = this.deps.providers.get(code);
    if (!provider) {
      throw new AppError(
        'NOT_IMPLEMENTED',
        'This payment method is not available yet.',
        'PROVIDER_NOT_INTEGRATED',
      );
    }
    return provider;
  }

  private isOffered(code: PaymentProviderCode): boolean {
    return code === 'MOCK'
      ? this.deps.allowMockProvider
      : getMarket(this.deps.marketCode).paymentProviders.includes(code);
  }

  private assertProviderOffered(code: PaymentProviderCode): void {
    if (!this.isOffered(code))
      throw new AppError(
        'VALIDATION_FAILED',
        'This payment method is not offered here.',
        'PROVIDER_NOT_OFFERED',
      );
  }

  private async ownPaymentMethodMsisdn(userId: string, paymentMethodId: string): Promise<string> {
    const [method] = await this.deps.db
      .select()
      .from(schema.paymentMethods)
      .where(
        and(
          eq(schema.paymentMethods.id, paymentMethodId),
          eq(schema.paymentMethods.userId, userId),
          isNull(schema.paymentMethods.deletedAt),
        ),
      );
    if (!method?.msisdn) throw new AppError('NOT_FOUND', 'Payment method not found.');
    return method.msisdn;
  }
}
