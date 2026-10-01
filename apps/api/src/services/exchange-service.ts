import { getMarket } from '@bambino/config';
import { type Database, type Executor, schema } from '@bambino/database';
import { and, asc, desc, eq, inArray, isNull, sql } from '@bambino/database/orm';
import type { ExchangeStatus } from '@bambino/types';
import { type CurrencyCode, money } from '@bambino/utils';
import { z } from 'zod';
import { exchangeLifecycle } from '../domain/lifecycles';
import { calculateTotals } from '../domain/pricing';
import { generateReference } from '../domain/references';
import { recordAudit } from './audit-service';
import { type ServiceContext, requirePermission, requireUser } from './context';
import type { CreditLedger } from './credit-ledger';
import { AppError, isUniqueViolation, parseInput } from './errors';
import type { GarmentService } from './garment-service';
import type { NotificationService } from './notification-service';
import type { OrderRow, OrderService } from './order-service';
import { type Page, type PageRequest, decodeOffset, encodeOffset, pageSize } from './pagination';

export type ExchangeRow = typeof schema.exchanges.$inferSelect;
export type ExchangeItemRow = typeof schema.exchangeItems.$inferSelect;
export type CreditEntryRow = typeof schema.exchangeCredits.$inferSelect;

const createSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(100),
  returnRequestId: z.uuid().nullish(),
  items: z
    .array(z.object({ returnItemId: z.uuid().nullish(), requestedVariantId: z.uuid() }))
    .min(1)
    .max(10),
  shippingAddressId: z.uuid(),
  deliveryOptionCode: z.string().trim().min(1).max(40),
});

const adjustmentSchema = z.object({
  customerId: z.uuid(),
  amount: z
    .number()
    .int()
    .min(-10_000_000)
    .max(10_000_000)
    .refine((value) => value !== 0, 'validation.amount.zero'),
  note: z.string().trim().min(3).max(500),
});

export interface ExchangeServiceDependencies {
  db: Database;
  orders: OrderService;
  garments: GarmentService;
  credit: CreditLedger;
  notifications: NotificationService;
  marketCode: string;
  currency: CurrencyCode;
  now: () => Date;
}

/**
 * The customer picks replacements (usually the next size). A replacement order is created at
 * once with the chosen garments reserved and available credit applied, but it can be paid and
 * shipped only after staff approve the exchange.
 *
 * Pricing PLACEHOLDER (open question 1): replacements are priced at catalogue price and the
 * customer's exchange credit is applied automatically.
 */
export class ExchangeService {
  constructor(private readonly deps: ExchangeServiceDependencies) {}

  async create(context: ServiceContext, rawInput: unknown): Promise<ExchangeRow> {
    const actor = requireUser(context);
    const input = parseInput(createSchema, rawInput);
    const { db, currency, now } = this.deps;

    const existing = await this.exchangeForOrderKey(db, actor.userId, input.idempotencyKey);
    if (existing) return existing;

    try {
      return await db.transaction(async (tx) => {
        await this.deps.orders.lockCustomer(tx, actor.userId);
        const again = await this.exchangeForOrderKey(tx, actor.userId, input.idempotencyKey);
        if (again) return again;

        if (input.returnRequestId) {
          const [request] = await tx
            .select({ id: schema.returnRequests.id, status: schema.returnRequests.status })
            .from(schema.returnRequests)
            .where(
              and(
                eq(schema.returnRequests.id, input.returnRequestId),
                eq(schema.returnRequests.userId, actor.userId),
              ),
            );
          if (!request) throw new AppError('NOT_FOUND', 'Return not found.');
          if (request.status === 'REJECTED')
            throw new AppError('CONFLICT', 'This return was rejected.', 'RETURN_REJECTED');
        }
        for (const item of input.items) {
          if (!item.returnItemId) continue;
          const [returnItem] = await tx
            .select({
              id: schema.returnItems.id,
              requestId: schema.returnItems.returnRequestId,
              userId: schema.returnRequests.userId,
            })
            .from(schema.returnItems)
            .innerJoin(
              schema.returnRequests,
              eq(schema.returnRequests.id, schema.returnItems.returnRequestId),
            )
            .where(eq(schema.returnItems.id, item.returnItemId));
          if (
            !returnItem ||
            returnItem.userId !== actor.userId ||
            (input.returnRequestId && returnItem.requestId !== input.returnRequestId)
          ) {
            throw new AppError('NOT_FOUND', 'Return item not found.');
          }
        }

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
        const [option] = await tx
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

        const variants = await tx
          .select({ variant: schema.productVariants, product: schema.products })
          .from(schema.productVariants)
          .innerJoin(schema.products, eq(schema.products.id, schema.productVariants.productId))
          .where(
            inArray(
              schema.productVariants.id,
              input.items.map((item) => item.requestedVariantId),
            ),
          );
        const byId = new Map(variants.map((row) => [row.variant.id, row]));
        for (const item of input.items) {
          const row = byId.get(item.requestedVariantId);
          if (!row || !row.variant.isActive || !row.product.isActive || row.product.deletedAt)
            throw new AppError('NOT_FOUND', 'A requested item is not available.');
        }

        const balance = await this.deps.credit.balance(tx, actor.userId);
        const totals = calculateTotals({
          currency,
          lines: input.items.map((item) => ({
            unitPrice: money(byId.get(item.requestedVariantId)?.variant.priceAmount ?? 0, currency),
            quantity: 1,
          })),
          shipping: money(option.feeAmount, currency),
          creditAvailable: balance,
          tax: getMarket(this.deps.marketCode).tax,
        });

        const order = await this.deps.orders.insertWithUniqueNumber(tx, {
          userId: actor.userId,
          type: 'EXCHANGE_REPLACEMENT',
          status: 'PENDING_PAYMENT',
          currency,
          subtotalAmount: totals.subtotal.amount,
          discountAmount: 0,
          creditAppliedAmount: totals.creditApplied.amount,
          shippingAmount: totals.shipping.amount,
          taxAmount: totals.tax.amount,
          totalAmount: totals.total.amount,
          shippingAddressId: address.id,
          shippingAddress: {
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
          idempotencyKey: input.idempotencyKey,
          placedAt: now(),
        });
        await tx
          .insert(schema.orderStatusEvents)
          .values({ orderId: order.id, newStatus: 'PENDING_PAYMENT', actorId: actor.userId });
        if (totals.creditApplied.amount > 0)
          await this.deps.credit.redeemForOrder(tx, actor.userId, order.id, totals.creditApplied);

        const exchange = await this.insertWithUniqueNumber(tx, {
          userId: actor.userId,
          returnRequestId: input.returnRequestId ?? null,
          replacementOrderId: order.id,
        });
        for (const item of input.items) {
          const row = byId.get(item.requestedVariantId);
          if (!row) continue;
          const garment = await this.deps.garments.reserveForVariant(tx, row.variant.id, {
            type: 'order',
            id: order.id,
          });
          await tx.insert(schema.orderItems).values({
            orderId: order.id,
            variantId: row.variant.id,
            garmentId: garment.id,
            productName: row.product.name,
            sku: row.variant.sku,
            sizeCode: row.variant.sizeCode,
            color: row.variant.color,
            unitPriceAmount: row.variant.priceAmount,
            quantity: 1,
            lineTotalAmount: row.variant.priceAmount,
          });
          await tx.insert(schema.exchangeItems).values({
            exchangeId: exchange.id,
            returnItemId: item.returnItemId ?? null,
            requestedVariantId: row.variant.id,
            replacementGarmentId: garment.id,
          });
        }
        return exchange;
      });
    } catch (error) {
      if (isUniqueViolation(error, 'exchange_items_return_item_uq')) {
        throw new AppError(
          'CONFLICT',
          'A returned garment is already part of another exchange.',
          'RETURN_ITEM_ALREADY_EXCHANGED',
        );
      }
      throw error;
    }
  }

  async listOwn(context: ServiceContext): Promise<ExchangeRow[]> {
    const actor = requireUser(context);
    return this.deps.db
      .select()
      .from(schema.exchanges)
      .where(eq(schema.exchanges.userId, actor.userId))
      .orderBy(desc(schema.exchanges.createdAt));
  }

  async itemsFor(exchangeIds: readonly string[]): Promise<ExchangeItemRow[]> {
    if (exchangeIds.length === 0) return [];
    return this.deps.db
      .select()
      .from(schema.exchangeItems)
      .where(inArray(schema.exchangeItems.exchangeId, [...exchangeIds]))
      .orderBy(asc(schema.exchangeItems.createdAt));
  }

  async creditSummary(context: ServiceContext): Promise<{ balance: number; entries: CreditEntryRow[] }> {
    const actor = requireUser(context);
    const entries = await this.deps.db
      .select()
      .from(schema.exchangeCredits)
      .where(eq(schema.exchangeCredits.userId, actor.userId))
      .orderBy(desc(schema.exchangeCredits.createdAt), desc(schema.exchangeCredits.id));
    return { balance: entries.reduce((total, entry) => total + entry.amount, 0), entries };
  }

  // --- order hooks ----------------------------------------------------------------

  async onOrderPaid(tx: Executor, order: OrderRow): Promise<void> {
    const exchange = await this.forOrder(tx, order);
    if (exchange?.status === 'APPROVED') await this.transition(tx, exchange, 'FULFILLING');
  }

  async onOrderDelivered(tx: Executor, order: OrderRow): Promise<void> {
    const exchange = await this.forOrder(tx, order);
    if (exchange?.status !== 'FULFILLING') return;
    await this.transition(tx, exchange, 'COMPLETED', { completedAt: this.deps.now() });
    await tx.insert(schema.analyticsEvents).values({
      eventName: 'EXCHANGE_COMPLETED',
      userId: exchange.userId,
      properties: { exchangeId: exchange.id },
      occurredAt: this.deps.now(),
    });
    await this.deps.notifications.notify(tx, exchange.userId, 'EXCHANGE_COMPLETED', {
      exchangeNumber: exchange.exchangeNumber,
    });
  }

  async onOrderCancelled(tx: Executor, order: OrderRow): Promise<void> {
    const exchange = await this.forOrder(tx, order);
    if (exchange && (exchange.status === 'REQUESTED' || exchange.status === 'APPROVED'))
      await this.transition(tx, exchange, 'CANCELLED');
  }

  // --- staff ------------------------------------------------------------------------

  async approve(context: ServiceContext, rawId: unknown): Promise<ExchangeRow> {
    const actor = requirePermission(context, 'exchange:write');
    return this.deps.db.transaction(async (tx) => {
      const exchange = await this.lock(tx, rawId);
      let updated = await this.transition(tx, exchange, 'APPROVED', {
        decidedBy: actor.userId,
        decidedAt: this.deps.now(),
      });
      await this.deps.notifications.notify(tx, exchange.userId, 'EXCHANGE_APPROVED', {
        exchangeNumber: exchange.exchangeNumber,
      });
      await recordAudit(tx, context, {
        action: 'exchange.approved',
        entityType: 'exchange',
        entityId: exchange.id,
      });
      // Fully covered by credit: nothing to collect, so it ships straight away.
      const order = exchange.replacementOrderId
        ? await this.deps.orders.lockOrder(tx, exchange.replacementOrderId)
        : null;
      if (order?.status === 'PENDING_PAYMENT' && order.totalAmount === 0) {
        await this.deps.orders.markPaid(tx, order, actor.userId);
        updated = await this.lock(tx, exchange.id);
      }
      return updated;
    });
  }

  async reject(context: ServiceContext, rawId: unknown, rawReason: unknown): Promise<ExchangeRow> {
    const actor = requirePermission(context, 'exchange:write');
    const reason = parseInput(z.string().trim().min(3).max(500), rawReason);
    return this.deps.db.transaction(async (tx) => {
      const exchange = await this.lock(tx, rawId);
      const updated = await this.transition(tx, exchange, 'REJECTED', {
        decidedBy: actor.userId,
        decidedAt: this.deps.now(),
      });
      const order = exchange.replacementOrderId
        ? await this.deps.orders.lockOrder(tx, exchange.replacementOrderId)
        : null;
      // Cancelling the replacement order frees its garments and returns the credit it used.
      if (order?.status === 'PENDING_PAYMENT')
        await this.deps.orders.cancelUnpaid(tx, order, actor.userId, `Exchange rejected: ${reason}`);
      await recordAudit(tx, context, {
        action: 'exchange.rejected',
        entityType: 'exchange',
        entityId: exchange.id,
        newValue: { reason },
      });
      return updated;
    });
  }

  /** Signed manual correction to a customer's credit, in the ledger and the audit log. */
  async adjustCredit(context: ServiceContext, raw: Record<string, unknown>): Promise<CreditEntryRow> {
    const actor = requirePermission(context, 'exchange:write');
    const input = parseInput(adjustmentSchema, raw);
    return this.deps.db.transaction(async (tx) => {
      await this.deps.orders.lockCustomer(tx, input.customerId);
      const [user] = await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.id, input.customerId));
      if (!user) throw new AppError('NOT_FOUND', 'Customer not found.');
      if (input.amount < 0) {
        const balance = await this.deps.credit.balance(tx, input.customerId);
        if (balance.amount + input.amount < 0)
          throw new AppError('CONFLICT', 'Credit cannot go below zero.', 'NEGATIVE_BALANCE');
      }
      const [entry] = await tx
        .insert(schema.exchangeCredits)
        .values({
          userId: input.customerId,
          entryType: 'ADJUSTMENT',
          amount: input.amount,
          currency: this.deps.currency,
          actorId: actor.userId,
          note: input.note,
        })
        .returning();
      if (!entry) throw new Error('Credit insert returned no row');
      await recordAudit(tx, context, {
        action: 'exchange_credit.adjusted',
        entityType: 'user',
        entityId: input.customerId,
        newValue: { amount: input.amount, note: input.note },
      });
      return entry;
    });
  }

  async listForStaff(
    context: ServiceContext,
    status: ExchangeStatus | null | undefined,
    request: PageRequest,
  ): Promise<Page<ExchangeRow> & { totalCount: number }> {
    requirePermission(context, 'exchange:read');
    const size = pageSize(request);
    const offset = decodeOffset(request.after);
    const where = status ? eq(schema.exchanges.status, status) : undefined;
    const rows = await this.deps.db
      .select()
      .from(schema.exchanges)
      .where(where)
      .orderBy(desc(schema.exchanges.createdAt), asc(schema.exchanges.id))
      .limit(size + 1)
      .offset(offset);
    const [count] = await this.deps.db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.exchanges)
      .where(where);
    const items = rows.slice(0, size);
    return {
      items,
      hasNextPage: rows.length > size,
      endCursor: items.length ? encodeOffset(offset + items.length) : null,
      totalCount: count?.n ?? 0,
    };
  }

  // --- internals ----------------------------------------------------------------------

  private async forOrder(tx: Executor, order: OrderRow): Promise<ExchangeRow | null> {
    if (order.type !== 'EXCHANGE_REPLACEMENT') return null;
    const [exchange] = await tx
      .select()
      .from(schema.exchanges)
      .where(eq(schema.exchanges.replacementOrderId, order.id))
      .for('update');
    return exchange ?? null;
  }

  private async transition(
    tx: Executor,
    exchange: ExchangeRow,
    to: ExchangeStatus,
    changes: Partial<typeof schema.exchanges.$inferInsert> = {},
  ): Promise<ExchangeRow> {
    exchangeLifecycle.assertTransition(exchange.status, to);
    const [updated] = await tx
      .update(schema.exchanges)
      .set({ status: to, ...changes })
      .where(and(eq(schema.exchanges.id, exchange.id), eq(schema.exchanges.status, exchange.status)))
      .returning();
    if (!updated)
      throw new AppError(
        'CONFLICT',
        'The exchange changed while you were working on it. Please retry.',
        'STALE_EXCHANGE',
      );
    return updated;
  }

  private async lock(tx: Executor, rawId: unknown): Promise<ExchangeRow> {
    const parsed = z.uuid().safeParse(rawId);
    if (!parsed.success) throw new AppError('NOT_FOUND', 'Exchange not found.');
    const [row] = await tx
      .select()
      .from(schema.exchanges)
      .where(eq(schema.exchanges.id, parsed.data))
      .for('update');
    if (!row) throw new AppError('NOT_FOUND', 'Exchange not found.');
    return row;
  }

  private async exchangeForOrderKey(db: Executor, userId: string, key: string): Promise<ExchangeRow | null> {
    const [row] = await db
      .select({ exchange: schema.exchanges })
      .from(schema.orders)
      .innerJoin(schema.exchanges, eq(schema.exchanges.replacementOrderId, schema.orders.id))
      .where(and(eq(schema.orders.userId, userId), eq(schema.orders.idempotencyKey, key)));
    return row?.exchange ?? null;
  }

  private async insertWithUniqueNumber(
    tx: Executor,
    values: Omit<typeof schema.exchanges.$inferInsert, 'exchangeNumber'>,
  ): Promise<ExchangeRow> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const exchangeNumber = generateReference('EXC');
      const [exists] = await tx
        .select({ id: schema.exchanges.id })
        .from(schema.exchanges)
        .where(eq(schema.exchanges.exchangeNumber, exchangeNumber));
      if (exists) continue;
      const [row] = await tx
        .insert(schema.exchanges)
        .values({ ...values, exchangeNumber })
        .returning();
      if (row) return row;
    }
    throw new Error('Could not allocate a unique exchange number');
  }
}
