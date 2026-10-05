import { getMarket } from '@bambino/config';
import { type Database, type Executor, schema } from '@bambino/database';
import { and, asc, desc, eq, inArray, isNull, lt, sql } from '@bambino/database/orm';
import { PAYMENT_PROVIDERS, type PaymentProviderCode, type PaymentStatus } from '@bambino/types';
import { phoneSchema } from '@bambino/validation';
import { money, type CurrencyCode } from '@bambino/utils';
import { z } from 'zod';
import { paymentLifecycle } from '../domain/lifecycles';
import type { Logger } from '../infra/logger';
import type { RateLimiter } from '../infra/rate-limiter';
import type { PaymentProviderRegistry, ProviderPaymentStatus } from '../providers/payments';
import { recordAudit } from './audit-service';
import { type ServiceContext, requirePermission, requireUser } from './context';
import { AppError, isUniqueViolation, parseInput } from './errors';
import type { NotificationService } from './notification-service';
import type { OrderService } from './order-service';
import type { RefundService } from './refund-service';
import { type Page, type PageRequest, decodeOffset, encodeOffset, pageSize } from './pagination';

export type PaymentRow = typeof schema.payments.$inferSelect;
export type PaymentTransactionRow = typeof schema.paymentTransactions.$inferSelect;
export type PaymentMethodRow = typeof schema.paymentMethods.$inferSelect;

/** Unanswered payments are re-checked with the provider after this long. */
export const RECONCILE_AFTER_MS = 2 * 60_000;
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
    const provider = this.providerFor(input.provider);

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
    try {
      const result = await provider.initiate({
        reference: payment.idempotencyKey,
        amount: money(payment.amount, this.deps.currency),
        payerMsisdn: input.msisdn,
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
        provider: input.provider,
        error,
      });
      return this.applyTransition(payment.id, 'FAILED', 'INITIATION', { failureCode: 'PROVIDER_ERROR' });
    }
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
    if (!parsed.signatureValid) {
      this.deps.logger.warn('webhook with invalid signature ignored', {
        provider: code,
        eventId: parsed.eventId,
      });
      return { status: 401 };
    }

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
    const unresolved = await this.deps.db
      .select()
      .from(schema.payments)
      .where(
        and(
          inArray(schema.payments.status, ['INITIATED', 'PENDING']),
          lt(schema.payments.initiatedAt, cutoff),
        ),
      )
      .limit(200);
    let expired = 0;
    for (const payment of unresolved) {
      const after = await this.refreshFromProvider(payment.id, 'RECONCILIATION');
      if (after.status === 'EXPIRED') expired += 1;
    }
    return { checked: unresolved.length, expired };
  }

  async reconcileOne(context: ServiceContext, rawId: unknown): Promise<PaymentRow> {
    requirePermission(context, 'payment:write');
    const id = parseInput(z.uuid(), rawId);
    const [payment] = await this.deps.db.select().from(schema.payments).where(eq(schema.payments.id, id));
    if (!payment) throw new AppError('NOT_FOUND', 'Payment not found.');
    const result = await this.refreshFromProvider(id, 'RECONCILIATION');
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
  ): Promise<PaymentRow> {
    const [payment] = await this.deps.db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.id, paymentId));
    if (!payment) throw new AppError('NOT_FOUND', 'Payment not found.');
    if (payment.status !== 'PENDING' && payment.status !== 'INITIATED') return payment;

    let answer: ProviderPaymentStatus = { status: 'PENDING' };
    if (payment.providerReference) {
      const provider = this.deps.providers.get(payment.provider);
      if (provider) answer = await provider.getStatus(payment.providerReference);
    }

    if (answer.status === 'SUCCEEDED') return this.applyTransition(paymentId, 'SUCCEEDED', source, {});
    if (answer.status === 'FAILED')
      return this.applyTransition(paymentId, 'FAILED', source, { failureCode: answer.failureCode });
    if (payment.expiresAt && payment.expiresAt <= this.deps.now()) {
      return this.applyTransition(paymentId, payment.status === 'INITIATED' ? 'FAILED' : 'EXPIRED', source, {
        failureCode: 'EXPIRED',
      });
    }
    return payment;
  }

  /**
   * Moves a payment to a new status with its consequences, in one transaction under a row
   * lock. If another process already moved it, the lifecycle refuses and the current row is returned.
   */
  private async applyTransition(
    paymentId: string,
    to: PaymentStatus,
    source: 'INITIATION' | 'STATUS_CHECK' | 'WEBHOOK' | 'RECONCILIATION',
    changes: { providerReference?: string; expiresAt?: Date | null; failureCode?: string },
  ): Promise<PaymentRow> {
    const { db, now } = this.deps;
    return db.transaction(async (tx) => {
      const [payment] = await tx
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.id, paymentId))
        .for('update');
      if (!payment) throw new AppError('NOT_FOUND', 'Payment not found.');
      if (!paymentLifecycle.canTransition(payment.status, to)) return payment;

      const final = to === 'SUCCEEDED' || to === 'FAILED' || to === 'EXPIRED' || to === 'CANCELLED';
      const [updated] = await tx
        .update(schema.payments)
        .set({
          status: to,
          ...(changes.providerReference ? { providerReference: changes.providerReference } : {}),
          ...(changes.expiresAt !== undefined ? { expiresAt: changes.expiresAt } : {}),
          ...(changes.failureCode ? { failureCode: changes.failureCode } : {}),
          ...(final ? { completedAt: now() } : {}),
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
        payload: changes.failureCode ? { failureCode: changes.failureCode } : null,
      });

      if (to === 'SUCCEEDED') await this.onSucceeded(tx, updated);
      if (to === 'FAILED' || to === 'EXPIRED') {
        await this.deps.notifications.notify(tx, payment.userId, 'PAYMENT_FAILED', {});
      }
      return updated;
    });
  }

  private async onSucceeded(tx: Executor, payment: PaymentRow): Promise<void> {
    await tx.insert(schema.analyticsEvents).values({
      eventName: 'PAYMENT_COMPLETED',
      userId: payment.userId,
      properties: { paymentId: payment.id, provider: payment.provider, amount: payment.amount },
      occurredAt: this.deps.now(),
    });
    await this.deps.notifications.notify(tx, payment.userId, 'PAYMENT_SUCCEEDED', {});
    if (!payment.orderId) return;
    const order = await this.deps.orders.lockOrder(tx, payment.orderId);
    if (order?.status === 'PENDING_PAYMENT') {
      await this.deps.orders.markPaid(tx, order, null);
    } else {
      // Money arrived for an order that can no longer take it. Recorded for staff to refund.
      this.deps.logger.error('payment succeeded for an order that is not awaiting payment; refund needed', {
        paymentId: payment.id,
        orderId: payment.orderId,
        orderStatus: order?.status,
      });
    }
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

  private assertProviderOffered(code: PaymentProviderCode): void {
    const offered =
      code === 'MOCK'
        ? this.deps.allowMockProvider
        : getMarket(this.deps.marketCode).paymentProviders.includes(code);
    if (!offered)
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
