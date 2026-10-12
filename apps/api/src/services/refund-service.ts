import { REFUND_POLICY } from '@bambino/config';
import { type Database, type Executor, schema } from '@bambino/database';
import { and, asc, desc, eq, inArray, notInArray, sql } from '@bambino/database/orm';
import { REFUND_METHODS, type RefundStatus } from '@bambino/types';
import { type CurrencyCode, money } from '@bambino/utils';
import { z } from 'zod';
import { refundLifecycle } from '../domain/lifecycles';
import type { Logger } from '../infra/logger';
import type { PaymentProviderRegistry, ProviderPaymentStatus } from '../providers/payments';
import { recordAudit } from './audit-service';
import { type ServiceContext, requirePermission } from './context';
import { AppError, isUniqueViolation, parseInput } from './errors';
import type { NotificationService } from './notification-service';
import type { OrderRow } from './order-service';
import { type Page, type PageRequest, decodeOffset, encodeOffset, pageSize } from './pagination';
import type { PaymentRow } from './payment-service';

export type RefundRow = typeof schema.refunds.$inferSelect;

const requestSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(100),
  paymentId: z.uuid(),
  /** Integer minor units. */
  amount: z.number().int().positive(),
  method: z.enum(REFUND_METHODS),
  reason: z.string().trim().min(3).max(500),
});

export interface RefundServiceDependencies {
  db: Database;
  providers: PaymentProviderRegistry;
  notifications: NotificationService;
  logger: Logger;
  currency: CurrencyCode;
  now: () => Date;
}

/**
 * Gives money back for successful payments, in full or in part. Every refund is REQUESTED first and paid out
 * only after staff approval (REFUND_POLICY, open question 13). The provider is asked under the refund's own
 * idempotency key, and only its answer (status check, webhook or reconciliation) marks a refund SUCCEEDED.
 */
export class RefundService {
  constructor(private readonly deps: RefundServiceDependencies) {}

  async request(context: ServiceContext, rawInput: unknown): Promise<RefundRow> {
    const actor = requirePermission(context, 'refund:write');
    const input = parseInput(requestSchema, rawInput);
    if (input.method === 'CREDIT' && !REFUND_POLICY.allowRefundAsCredit) {
      throw new AppError(
        'VALIDATION_FAILED',
        'Refunds as exchange credit are not offered.',
        'REFUND_AS_CREDIT_NOT_ALLOWED',
      );
    }
    const [existing] = await this.deps.db
      .select()
      .from(schema.refunds)
      .where(eq(schema.refunds.idempotencyKey, input.idempotencyKey));
    if (existing) {
      if (existing.paymentId !== input.paymentId || existing.amount !== input.amount) {
        throw new AppError(
          'CONFLICT',
          'This request key was already used for something else.',
          'IDEMPOTENCY_KEY_REUSED',
        );
      }
      return existing;
    }
    try {
      return await this.deps.db.transaction(async (tx) => {
        const payment = await this.lockPayment(tx, input.paymentId);
        const refund = await this.create(tx, payment, {
          amount: input.amount,
          method: input.method,
          reason: input.reason,
          idempotencyKey: input.idempotencyKey,
          requestedBy: actor.userId,
        });
        await recordAudit(tx, context, {
          action: 'refund.requested',
          entityType: 'refund',
          entityId: refund.id,
          newValue: {
            paymentId: payment.id,
            amount: refund.amount,
            method: refund.method,
            reason: refund.reason,
          },
        });
        return refund;
      });
    } catch (error) {
      if (isUniqueViolation(error, 'refunds_idempotency_key_uq')) {
        const [winner] = await this.deps.db
          .select()
          .from(schema.refunds)
          .where(eq(schema.refunds.idempotencyKey, input.idempotencyKey));
        if (winner) return winner;
      }
      throw error;
    }
  }

  /**
   * Requests a full refund of an order's successful payment, inside the cancellation transaction. Nothing to
   * refund when credit covered the whole order.
   */
  async requestForCancelledOrder(
    tx: Executor,
    order: OrderRow,
    requestedBy: string,
    reason: string,
  ): Promise<RefundRow | null> {
    const [paid] = await tx
      .select()
      .from(schema.payments)
      .where(and(eq(schema.payments.orderId, order.id), eq(schema.payments.status, 'SUCCEEDED')));
    if (!paid) return null;
    const payment = await this.lockPayment(tx, paid.id);
    const refundable = payment.amount - (await this.held(tx, payment.id));
    if (refundable <= 0) return null;
    return this.create(tx, payment, {
      amount: refundable,
      method: 'PROVIDER',
      reason,
      idempotencyKey: `order-cancel:${order.id}`,
      requestedBy,
    });
  }

  async approve(context: ServiceContext, rawId: unknown): Promise<RefundRow> {
    const actor = requirePermission(context, 'refund:write');
    const id = parseInput(z.uuid(), rawId);
    const approved = await this.deps.db.transaction(async (tx) => {
      const refund = await this.lock(tx, id);
      const payment = await this.lockPayment(tx, refund.paymentId, { forRefundOf: refund });
      if (refund.method === 'PROVIDER') this.providerFor(payment);
      refundLifecycle.assertTransition(refund.status, 'APPROVED');
      await this.set(tx, refund.id, 'APPROVED', { decidedBy: actor.userId, decidedAt: this.deps.now() });
      const processing = await this.set(tx, refund.id, 'PROCESSING', {});
      await recordAudit(tx, context, {
        action: 'refund.approved',
        entityType: 'refund',
        entityId: refund.id,
        previousValue: { status: refund.status },
        newValue: { status: 'PROCESSING' },
      });
      if (refund.method === 'CREDIT') {
        await tx.insert(schema.exchangeCredits).values({
          userId: refund.userId,
          entryType: 'ADJUSTMENT',
          amount: refund.amount,
          currency: refund.currency,
          orderId: refund.orderId,
          actorId: actor.userId,
          note: `Refund ${refund.id} given as exchange credit`,
        });
        return this.complete(tx, processing, 'SUCCEEDED', null);
      }
      return processing;
    });
    if (approved.method === 'PROVIDER') return this.sendToProvider(approved);
    return approved;
  }

  async reject(context: ServiceContext, rawId: unknown, rawNote: unknown): Promise<RefundRow> {
    const actor = requirePermission(context, 'refund:write');
    const id = parseInput(z.uuid(), rawId);
    const note = parseInput(z.string().trim().max(500).nullish(), rawNote) ?? null;
    return this.deps.db.transaction(async (tx) => {
      const refund = await this.lock(tx, id);
      refundLifecycle.assertTransition(refund.status, 'REJECTED');
      const updated = await this.set(tx, refund.id, 'REJECTED', {
        decidedBy: actor.userId,
        decidedAt: this.deps.now(),
        completedAt: this.deps.now(),
      });
      await this.deps.notifications.notify(tx, refund.userId, 'REFUND_REJECTED', {
        amount: refund.amount,
        currency: refund.currency,
      });
      await recordAudit(tx, context, {
        action: 'refund.rejected',
        entityType: 'refund',
        entityId: refund.id,
        previousValue: { status: refund.status },
        newValue: { status: 'REJECTED', note },
      });
      return updated;
    });
  }

  /** Webhook path: true when the provider reference belongs to a refund (and the refund was refreshed). */
  async refreshByProviderReference(providerReference: string): Promise<boolean> {
    const [refund] = await this.deps.db
      .select()
      .from(schema.refunds)
      .where(eq(schema.refunds.providerReference, providerReference));
    if (!refund) return false;
    await this.refreshFromProvider(refund.id);
    return true;
  }

  /** Re-checks refunds the provider is still working on. Run with payment reconciliation. */
  async reconcile(): Promise<{ checked: number }> {
    const processing = await this.deps.db
      .select({ id: schema.refunds.id })
      .from(schema.refunds)
      .where(eq(schema.refunds.status, 'PROCESSING'))
      .limit(200);
    for (const { id } of processing) await this.refreshFromProvider(id);
    return { checked: processing.length };
  }

  async listForStaff(
    context: ServiceContext,
    status: RefundStatus | null | undefined,
    request: PageRequest,
  ): Promise<Page<RefundRow> & { totalCount: number }> {
    requirePermission(context, 'refund:read');
    const size = pageSize(request);
    const offset = decodeOffset(request.after);
    const where = status ? eq(schema.refunds.status, status) : undefined;
    const rows = await this.deps.db
      .select()
      .from(schema.refunds)
      .where(where)
      .orderBy(desc(schema.refunds.createdAt), desc(schema.refunds.id))
      .limit(size + 1)
      .offset(offset);
    const [count] = await this.deps.db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.refunds)
      .where(where);
    const items = rows.slice(0, size);
    return {
      items,
      hasNextPage: rows.length > size,
      endCursor: items.length ? encodeOffset(offset + items.length) : null,
      totalCount: count?.n ?? 0,
    };
  }

  async forPayments(paymentIds: readonly string[]): Promise<RefundRow[]> {
    if (paymentIds.length === 0) return [];
    return this.deps.db
      .select()
      .from(schema.refunds)
      .where(inArray(schema.refunds.paymentId, [...paymentIds]))
      .orderBy(asc(schema.refunds.createdAt));
  }

  async forOrders(orderIds: readonly string[]): Promise<RefundRow[]> {
    if (orderIds.length === 0) return [];
    return this.deps.db
      .select()
      .from(schema.refunds)
      .where(inArray(schema.refunds.orderId, [...orderIds]))
      .orderBy(asc(schema.refunds.createdAt));
  }

  /** What can still be refunded on a payment: its amount less open and succeeded refunds. */
  async refundable(payment: PaymentRow): Promise<number> {
    if (payment.status !== 'SUCCEEDED') return 0;
    return Math.max(0, payment.amount - (await this.held(this.deps.db, payment.id)));
  }

  // --- internals --------------------------------------------------------------

  private async create(
    tx: Executor,
    payment: PaymentRow,
    input: {
      amount: number;
      method: RefundRow['method'];
      reason: string;
      idempotencyKey: string;
      requestedBy: string;
    },
  ): Promise<RefundRow> {
    if (payment.status !== 'SUCCEEDED') {
      throw new AppError('CONFLICT', 'Only a successful payment can be refunded.', 'PAYMENT_NOT_REFUNDABLE');
    }
    if (payment.provider === 'CASH_ON_DELIVERY' && input.method === 'PROVIDER') {
      throw new AppError(
        'CONFLICT',
        'Cash payments cannot be refunded online. Refund the customer in person and note it on the order.',
        'CASH_REFUND_MANUAL',
      );
    }
    const refundable = payment.amount - (await this.held(tx, payment.id));
    if (input.amount > refundable) {
      throw new AppError(
        'VALIDATION_FAILED',
        `At most ${refundable} ${payment.currency} can still be refunded on this payment.`,
        'REFUND_EXCEEDS_PAYMENT',
      );
    }
    const [refund] = await tx
      .insert(schema.refunds)
      .values({
        paymentId: payment.id,
        orderId: payment.orderId,
        userId: payment.userId,
        method: input.method,
        status: 'REQUESTED',
        amount: input.amount,
        currency: payment.currency,
        reason: input.reason,
        idempotencyKey: input.idempotencyKey,
        requestedBy: input.requestedBy,
      })
      .returning();
    if (!refund) throw new Error('Refund insert returned no row');
    return refund;
  }

  /** The provider call happens outside the transaction; its outcome is recorded either way. */
  private async sendToProvider(refund: RefundRow): Promise<RefundRow> {
    const [payment] = await this.deps.db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.id, refund.paymentId));
    if (!payment?.providerReference) return this.fail(refund.id, 'NO_PROVIDER_REFERENCE');
    try {
      const provider = this.providerFor(payment);
      const result = await provider.refund({
        reference: refund.idempotencyKey,
        paymentProviderReference: payment.providerReference,
        amount: money(refund.amount, this.deps.currency),
      });
      const [updated] = await this.deps.db
        .update(schema.refunds)
        .set({ providerReference: result.providerReference })
        .where(eq(schema.refunds.id, refund.id))
        .returning();
      return updated ?? refund;
    } catch (error) {
      this.deps.logger.error('refund request failed at provider', { refundId: refund.id, error });
      return this.fail(refund.id, 'PROVIDER_ERROR');
    }
  }

  private async refreshFromProvider(refundId: string): Promise<RefundRow> {
    const [refund] = await this.deps.db.select().from(schema.refunds).where(eq(schema.refunds.id, refundId));
    if (!refund) throw new AppError('NOT_FOUND', 'Refund not found.');
    if (refund.status !== 'PROCESSING' || !refund.providerReference) return refund;
    const [payment] = await this.deps.db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.id, refund.paymentId));
    const provider = payment ? this.deps.providers.get(payment.provider) : undefined;
    if (!provider) return refund;
    const answer: ProviderPaymentStatus = await provider.getRefundStatus(refund.providerReference);
    if (answer.status === 'PENDING') return refund;
    return this.deps.db.transaction(async (tx) => {
      const locked = await this.lock(tx, refund.id);
      if (locked.status !== 'PROCESSING') return locked;
      return this.complete(tx, locked, answer.status, answer.status === 'FAILED' ? answer.failureCode : null);
    });
  }

  private async fail(refundId: string, failureCode: string): Promise<RefundRow> {
    return this.deps.db.transaction(async (tx) => {
      const refund = await this.lock(tx, refundId);
      if (refund.status !== 'PROCESSING') return refund;
      return this.complete(tx, refund, 'FAILED', failureCode);
    });
  }

  /**
   * Finishes a refund. On success the payment's log gets a REFUND entry, the payment becomes REFUNDED once
   * refunds cover all of it, and the customer is told. Recorded in the audit log as a system action.
   */
  private async complete(
    tx: Executor,
    refund: RefundRow,
    to: 'SUCCEEDED' | 'FAILED',
    failureCode: string | null,
  ): Promise<RefundRow> {
    const updated = await this.set(tx, refund.id, to, {
      completedAt: this.deps.now(),
      ...(failureCode ? { failureCode } : {}),
    });
    if (to === 'SUCCEEDED') {
      const payment = await this.lockPayment(tx, refund.paymentId, { forRefundOf: refund });
      const [row] = await tx
        .select({ total: sql<number>`coalesce(sum(${schema.refunds.amount}), 0)::bigint` })
        .from(schema.refunds)
        .where(and(eq(schema.refunds.paymentId, payment.id), eq(schema.refunds.status, 'SUCCEEDED')));
      const fullyRefunded = Number(row?.total ?? 0) >= payment.amount;
      if (fullyRefunded) {
        await tx
          .update(schema.payments)
          .set({ status: 'REFUNDED' })
          .where(eq(schema.payments.id, payment.id));
      }
      await tx.insert(schema.paymentTransactions).values({
        paymentId: payment.id,
        type: 'REFUND',
        resultingStatus: fullyRefunded ? 'REFUNDED' : payment.status,
        amount: refund.amount,
        currency: refund.currency,
        providerReference: refund.providerReference,
        payload: { refundId: refund.id, method: refund.method },
      });
      await this.deps.notifications.notify(tx, refund.userId, 'REFUND_SUCCEEDED', {
        amount: refund.amount,
        currency: refund.currency,
      });
    }
    await tx.insert(schema.auditLogs).values({
      actorId: null,
      action: to === 'SUCCEEDED' ? 'refund.succeeded' : 'refund.failed',
      entityType: 'refund',
      entityId: refund.id,
      previousValue: { status: refund.status },
      newValue: { status: to, failureCode },
    });
    return updated;
  }

  private async set(
    tx: Executor,
    id: string,
    to: RefundStatus,
    changes: Partial<Pick<RefundRow, 'decidedBy' | 'decidedAt' | 'completedAt' | 'failureCode'>>,
  ): Promise<RefundRow> {
    const [current] = await tx.select().from(schema.refunds).where(eq(schema.refunds.id, id));
    if (!current) throw new AppError('NOT_FOUND', 'Refund not found.');
    refundLifecycle.assertTransition(current.status, to);
    const [updated] = await tx
      .update(schema.refunds)
      .set({ status: to, ...changes })
      .where(eq(schema.refunds.id, id))
      .returning();
    if (!updated) throw new Error('Refund vanished during update');
    return updated;
  }

  private async lock(tx: Executor, id: string): Promise<RefundRow> {
    const [refund] = await tx.select().from(schema.refunds).where(eq(schema.refunds.id, id)).for('update');
    if (!refund) throw new AppError('NOT_FOUND', 'Refund not found.');
    return refund;
  }

  /** Locks the payment so two refunds cannot both claim the same money. */
  private async lockPayment(
    tx: Executor,
    paymentId: string,
    options: { forRefundOf?: RefundRow } = {},
  ): Promise<PaymentRow> {
    const [payment] = await tx
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.id, paymentId))
      .for('update');
    if (!payment) throw new AppError('NOT_FOUND', 'Payment not found.');
    if (options.forRefundOf && payment.id !== options.forRefundOf.paymentId) {
      throw new Error('Refund and payment do not match');
    }
    return payment;
  }

  private async held(db: Executor, paymentId: string): Promise<number> {
    const [row] = await db
      .select({ total: sql<number>`coalesce(sum(${schema.refunds.amount}), 0)::bigint` })
      .from(schema.refunds)
      .where(
        and(
          eq(schema.refunds.paymentId, paymentId),
          notInArray(schema.refunds.status, ['REJECTED', 'FAILED']),
        ),
      );
    return Number(row?.total ?? 0);
  }

  private providerFor(payment: PaymentRow) {
    const provider = this.deps.providers.get(payment.provider);
    if (!provider) {
      throw new AppError(
        'NOT_IMPLEMENTED',
        'Refunds through this payment method are not available yet.',
        'PROVIDER_NOT_INTEGRATED',
      );
    }
    return provider;
  }
}
