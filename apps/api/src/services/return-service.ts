import { EXCHANGE_CREDIT_POLICY } from '@bambino/config';
import { type Database, type Executor, schema } from '@bambino/database';
import { and, asc, desc, eq, inArray, isNull, sql } from '@bambino/database/orm';
import {
  FIT_OUTCOMES,
  GARMENT_CONDITIONS,
  RETURN_ITEM_OUTCOMES,
  RETURN_REASONS,
  type GarmentStatus,
  type ReturnStatus,
} from '@bambino/types';
import { basisPointsOf, money, type CurrencyCode } from '@bambino/utils';
import { z } from 'zod';
import { returnLifecycle } from '../domain/lifecycles';
import { generateReference } from '../domain/references';
import { recordAudit } from './audit-service';
import { type ServiceContext, requirePermission, requireUser } from './context';
import type { DeliveryRow, DeliveryService } from './delivery-service';
import { AppError, parseInput } from './errors';
import type { GarmentService } from './garment-service';
import type { NotificationService } from './notification-service';
import type { OrderService } from './order-service';
import { type Page, type PageRequest, decodeOffset, encodeOffset, pageSize } from './pagination';

export type ReturnRequestRow = typeof schema.returnRequests.$inferSelect;
export type ReturnItemRow = typeof schema.returnItems.$inferSelect;

/** Where an inspected garment may go next. */
const AFTER_INSPECTION: readonly GarmentStatus[] = [
  'AVAILABLE_FOR_REUSE',
  'REFURBISHING',
  'RESALE',
  'RECYCLE',
];

const requestSchema = z.object({
  items: z
    .array(z.object({ garmentId: z.uuid(), reportedFit: z.enum(FIT_OUTCOMES).nullish() }))
    .min(1)
    .max(30),
  reason: z.enum(RETURN_REASONS),
  customerNote: z.string().trim().max(1_000).nullish(),
  pickupAddressId: z.uuid().nullish(),
});

const inspectionSchema = z.object({
  returnItemId: z.uuid(),
  condition: z.enum(GARMENT_CONDITIONS),
  outcome: z.enum(RETURN_ITEM_OUTCOMES),
  notes: z.string().trim().max(1_000).nullish(),
  garmentStatus: z.enum(AFTER_INSPECTION as [GarmentStatus, ...GarmentStatus[]]),
});

export interface ReturnServiceDependencies {
  db: Database;
  garments: GarmentService;
  delivery: DeliveryService;
  orders: OrderService;
  notifications: NotificationService;
  currency: CurrencyCode;
  now: () => Date;
}

/**
 * The circular loop's way back: request, approval, receipt, inspection of each garment,
 * credit for accepted garments, completion. Garments are never deleted along the way.
 */
export class ReturnService {
  constructor(private readonly deps: ReturnServiceDependencies) {}

  async request(context: ServiceContext, rawInput: unknown): Promise<ReturnRequestRow> {
    const actor = requireUser(context);
    const input = parseInput(requestSchema, rawInput);
    const garmentIds = [...new Set(input.items.map((item) => item.garmentId))];
    if (garmentIds.length !== input.items.length)
      throw new AppError('VALIDATION_FAILED', 'Each garment can be listed once.', 'DUPLICATE_GARMENT');
    const { db, now } = this.deps;

    return db.transaction(async (tx) => {
      const garments = [];
      for (const id of garmentIds) {
        const garment = await this.deps.garments.lock(tx, id).catch(() => null);
        // Garments the customer does not hold look the same as missing ones.
        if (!garment || garment.currentCustomerId !== actor.userId || garment.status !== 'WITH_CUSTOMER') {
          throw new AppError(
            'NOT_FOUND',
            'One of these garments cannot be returned.',
            'GARMENT_NOT_RETURNABLE',
          );
        }
        garments.push(garment);
      }

      let pickupAddress: typeof schema.addresses.$inferSelect | undefined;
      if (input.pickupAddressId) {
        [pickupAddress] = await tx
          .select()
          .from(schema.addresses)
          .where(
            and(
              eq(schema.addresses.id, input.pickupAddressId),
              eq(schema.addresses.userId, actor.userId),
              isNull(schema.addresses.deletedAt),
            ),
          );
        if (!pickupAddress) throw new AppError('NOT_FOUND', 'Address not found.');
      }

      const request = await this.insertWithUniqueNumber(tx, {
        userId: actor.userId,
        reason: input.reason,
        customerNote: input.customerNote ?? null,
      });

      for (const garment of garments) {
        const [orderItem] = await tx
          .select({ id: schema.orderItems.id, orderId: schema.orderItems.orderId })
          .from(schema.orderItems)
          .where(eq(schema.orderItems.garmentId, garment.id))
          .orderBy(desc(schema.orderItems.createdAt))
          .limit(1);
        await tx.insert(schema.returnItems).values({
          returnRequestId: request.id,
          garmentId: garment.id,
          orderItemId: orderItem?.id ?? null,
          reportedFit: input.items.find((item) => item.garmentId === garment.id)?.reportedFit ?? null,
        });
        await this.deps.garments.transition(tx, garment, 'RETURN_REQUESTED', {
          eventType: 'RETURN_REQUESTED',
          actorId: actor.userId,
          metadata: { returnRequestId: request.id },
        });
        if (orderItem) await this.moveOrder(tx, orderItem.orderId, 'requested', actor.userId);
      }

      if (pickupAddress) {
        await this.deps.delivery.createPickup(tx, {
          returnRequestId: request.id,
          address: {
            recipientName: pickupAddress.recipientName,
            phone: pickupAddress.phone,
            countryCode: pickupAddress.countryCode,
            region: pickupAddress.region,
            district: pickupAddress.district,
            sector: pickupAddress.sector,
            street: pickupAddress.street,
            directions: pickupAddress.directions,
          },
        });
      }
      await tx.insert(schema.analyticsEvents).values({
        eventName: 'RETURN_REQUESTED',
        userId: actor.userId,
        properties: { returnRequestId: request.id, items: garments.length, reason: input.reason },
        occurredAt: now(),
      });
      return request;
    });
  }

  async listOwn(context: ServiceContext): Promise<ReturnRequestRow[]> {
    const actor = requireUser(context);
    return this.deps.db
      .select()
      .from(schema.returnRequests)
      .where(eq(schema.returnRequests.userId, actor.userId))
      .orderBy(desc(schema.returnRequests.createdAt));
  }

  async getOwn(context: ServiceContext, rawId: unknown): Promise<ReturnRequestRow | null> {
    const actor = requireUser(context);
    const parsed = z.uuid().safeParse(rawId);
    if (!parsed.success) return null;
    const [row] = await this.deps.db
      .select()
      .from(schema.returnRequests)
      .where(and(eq(schema.returnRequests.id, parsed.data), eq(schema.returnRequests.userId, actor.userId)));
    return row ?? null;
  }

  async itemsFor(requestIds: readonly string[]): Promise<ReturnItemRow[]> {
    if (requestIds.length === 0) return [];
    return this.deps.db
      .select()
      .from(schema.returnItems)
      .where(inArray(schema.returnItems.returnRequestId, [...requestIds]))
      .orderBy(asc(schema.returnItems.createdAt));
  }

  async itemsByIds(ids: readonly string[]): Promise<ReturnItemRow[]> {
    return ids.length
      ? this.deps.db
          .select()
          .from(schema.returnItems)
          .where(inArray(schema.returnItems.id, [...ids]))
      : [];
  }

  async byIds(ids: readonly string[]): Promise<ReturnRequestRow[]> {
    return ids.length
      ? this.deps.db
          .select()
          .from(schema.returnRequests)
          .where(inArray(schema.returnRequests.id, [...ids]))
      : [];
  }

  async getForStaff(context: ServiceContext, rawId: unknown): Promise<ReturnRequestRow | null> {
    requirePermission(context, 'return:read');
    const parsed = z.uuid().safeParse(rawId);
    if (!parsed.success) return null;
    const [row] = await this.byIds([parsed.data]);
    return row ?? null;
  }

  /** Credit earned per return item, from the ledger. */
  async creditEarnedFor(itemIds: readonly string[]): Promise<Map<string, number>> {
    if (itemIds.length === 0) return new Map();
    const rows = await this.deps.db
      .select({ itemId: schema.exchangeCredits.returnItemId, amount: schema.exchangeCredits.amount })
      .from(schema.exchangeCredits)
      .where(
        and(
          inArray(schema.exchangeCredits.returnItemId, [...itemIds]),
          eq(schema.exchangeCredits.entryType, 'EARNED'),
        ),
      );
    return new Map(rows.map((row) => [row.itemId ?? '', row.amount]));
  }

  // --- staff ------------------------------------------------------------------

  async approve(context: ServiceContext, rawId: unknown): Promise<ReturnRequestRow> {
    const actor = requirePermission(context, 'return:write');
    return this.deps.db.transaction(async (tx) => {
      const request = await this.lock(tx, rawId);
      const updated = await this.transition(tx, request, 'APPROVED', {
        decidedBy: actor.userId,
        decidedAt: this.deps.now(),
      });
      await this.deps.notifications.notify(tx, request.userId, 'RETURN_APPROVED', {
        returnNumber: request.returnNumber,
      });
      await recordAudit(tx, context, {
        action: 'return.approved',
        entityType: 'return_request',
        entityId: request.id,
      });
      return updated;
    });
  }

  async reject(context: ServiceContext, rawId: unknown, rawReason: unknown): Promise<ReturnRequestRow> {
    const actor = requirePermission(context, 'return:write');
    const reason = parseInput(z.string().trim().min(3).max(500), rawReason);
    return this.deps.db.transaction(async (tx) => {
      const request = await this.lock(tx, rawId);
      const updated = await this.transition(tx, request, 'REJECTED', {
        decidedBy: actor.userId,
        decidedAt: this.deps.now(),
        rejectionReason: reason,
      });
      const items = await tx
        .select()
        .from(schema.returnItems)
        .where(eq(schema.returnItems.returnRequestId, request.id));
      for (const item of items) {
        const garment = await this.deps.garments.lock(tx, item.garmentId);
        if (garment.status === 'RETURN_REQUESTED') {
          await this.deps.garments.transition(tx, garment, 'WITH_CUSTOMER', {
            eventType: 'RETURN_REJECTED',
            actorId: actor.userId,
            metadata: { returnRequestId: request.id },
          });
        }
      }
      await this.deps.delivery.cancelPickupsFor(tx, request.id);
      await this.settleOrders(tx, request.id, actor.userId);
      await recordAudit(tx, context, {
        action: 'return.rejected',
        entityType: 'return_request',
        entityId: request.id,
        newValue: { reason },
      });
      return updated;
    });
  }

  async markReceived(context: ServiceContext, rawId: unknown): Promise<ReturnRequestRow> {
    const actor = requirePermission(context, 'return:write');
    return this.deps.db.transaction(async (tx) => {
      const request = await this.lock(tx, rawId);
      const updated = await this.receive(tx, request, actor.userId);
      await recordAudit(tx, context, {
        action: 'return.received',
        entityType: 'return_request',
        entityId: request.id,
      });
      return updated;
    });
  }

  /**
   * Records one garment's inspection: its condition, whether the return of it is accepted,
   * and where it goes next. Accepted garments earn exchange credit by EXCHANGE_CREDIT_POLICY.
   * When every garment is inspected the return becomes ACCEPTED (any accepted) or REJECTED.
   */
  async recordInspection(context: ServiceContext, rawInput: unknown): Promise<ReturnRequestRow> {
    const actor = requirePermission(context, 'return:write');
    const input = parseInput(inspectionSchema, rawInput);
    const { now } = this.deps;
    return this.deps.db.transaction(async (tx) => {
      const [item] = await tx
        .select()
        .from(schema.returnItems)
        .where(eq(schema.returnItems.id, input.returnItemId))
        .for('update');
      if (!item) throw new AppError('NOT_FOUND', 'Return item not found.');
      if (item.outcome)
        throw new AppError('CONFLICT', 'This garment has already been inspected.', 'ALREADY_INSPECTED');
      let request = await this.lock(tx, item.returnRequestId);
      if (request.status === 'RECEIVED') request = await this.transition(tx, request, 'INSPECTING');
      if (request.status !== 'INSPECTING')
        throw new AppError('CONFLICT', 'The return must be received before inspection.', 'NOT_RECEIVED');

      let garment = await this.deps.garments.lock(tx, item.garmentId);
      garment = await this.deps.garments.transition(tx, garment, 'INSPECTION', {
        eventType: 'INSPECTED',
        actorId: actor.userId,
        condition: input.condition,
        inspected: true,
        countCycle: true,
        metadata: { returnRequestId: request.id, outcome: input.outcome, notes: input.notes ?? null },
      });
      await this.deps.garments.transition(tx, garment, input.garmentStatus, {
        eventType: 'ROUTED_AFTER_INSPECTION',
        actorId: actor.userId,
      });

      await tx
        .update(schema.returnItems)
        .set({
          inspectedCondition: input.condition,
          inspectionNotes: input.notes ?? null,
          inspectedBy: actor.userId,
          inspectedAt: now(),
          outcome: input.outcome,
        })
        .where(eq(schema.returnItems.id, item.id));

      let credit = 0;
      if (input.outcome === 'ACCEPTED') {
        const [variant] = await tx
          .select({ priceAmount: schema.productVariants.priceAmount })
          .from(schema.productVariants)
          .where(eq(schema.productVariants.id, garment.variantId));
        credit = basisPointsOf(
          money(variant?.priceAmount ?? 0, this.deps.currency),
          EXCHANGE_CREDIT_POLICY[input.condition],
        ).amount;
        if (credit > 0) {
          await tx.insert(schema.exchangeCredits).values({
            userId: request.userId,
            entryType: 'EARNED',
            amount: credit,
            currency: this.deps.currency,
            returnItemId: item.id,
            actorId: actor.userId,
            note: `Returned garment ${garment.tagCode} in ${input.condition} condition`,
          });
        }
      }
      await recordAudit(tx, context, {
        action: 'return.item_inspected',
        entityType: 'return_item',
        entityId: item.id,
        newValue: {
          condition: input.condition,
          outcome: input.outcome,
          garmentStatus: input.garmentStatus,
          credit,
        },
      });

      const [pending] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.returnItems)
        .where(and(eq(schema.returnItems.returnRequestId, request.id), isNull(schema.returnItems.outcome)));
      if ((pending?.n ?? 0) === 0) {
        const [accepted] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(schema.returnItems)
          .where(
            and(
              eq(schema.returnItems.returnRequestId, request.id),
              eq(schema.returnItems.outcome, 'ACCEPTED'),
            ),
          );
        request = await this.transition(tx, request, (accepted?.n ?? 0) > 0 ? 'ACCEPTED' : 'REJECTED', {
          decidedBy: actor.userId,
          decidedAt: now(),
        });
        await this.settleOrders(tx, request.id, actor.userId);
      }
      return request;
    });
  }

  async complete(context: ServiceContext, rawId: unknown): Promise<ReturnRequestRow> {
    requirePermission(context, 'return:write');
    return this.deps.db.transaction(async (tx) => {
      const request = await this.lock(tx, rawId);
      const updated = await this.transition(tx, request, 'COMPLETED', { completedAt: this.deps.now() });
      await tx.insert(schema.analyticsEvents).values({
        eventName: 'RETURN_COMPLETED',
        userId: request.userId,
        properties: { returnRequestId: request.id },
        occurredAt: this.deps.now(),
      });
      await recordAudit(tx, context, {
        action: 'return.completed',
        entityType: 'return_request',
        entityId: request.id,
      });
      return updated;
    });
  }

  async listForStaff(
    context: ServiceContext,
    status: ReturnStatus | null | undefined,
    request: PageRequest,
  ): Promise<Page<ReturnRequestRow> & { totalCount: number }> {
    requirePermission(context, 'return:read');
    const size = pageSize(request);
    const offset = decodeOffset(request.after);
    const where = status ? eq(schema.returnRequests.status, status) : undefined;
    const rows = await this.deps.db
      .select()
      .from(schema.returnRequests)
      .where(where)
      .orderBy(desc(schema.returnRequests.createdAt), asc(schema.returnRequests.id))
      .limit(size + 1)
      .offset(offset);
    const [count] = await this.deps.db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.returnRequests)
      .where(where);
    const items = rows.slice(0, size);
    return {
      items,
      hasNextPage: rows.length > size,
      endCursor: items.length ? encodeOffset(offset + items.length) : null,
      totalCount: count?.n ?? 0,
    };
  }

  /** Follows the pickup delivery: collected and in transit, then delivered to the warehouse. */
  async onPickupStatus(tx: Executor, delivery: DeliveryRow, status: string, actorId: string): Promise<void> {
    if (!delivery.returnRequestId) return;
    const request = await this.lock(tx, delivery.returnRequestId);
    if (status === 'IN_TRANSIT' && request.status === 'APPROVED')
      await this.transition(tx, request, 'IN_TRANSIT');
    if (status === 'DELIVERED' && (request.status === 'APPROVED' || request.status === 'IN_TRANSIT'))
      await this.receive(tx, request, actorId);
  }

  // --- internals --------------------------------------------------------------

  private async receive(tx: Executor, request: ReturnRequestRow, actorId: string): Promise<ReturnRequestRow> {
    const updated = await this.transition(tx, request, 'RECEIVED', { receivedAt: this.deps.now() });
    const items = await tx
      .select()
      .from(schema.returnItems)
      .where(eq(schema.returnItems.returnRequestId, request.id));
    for (const item of items) {
      const garment = await this.deps.garments.lock(tx, item.garmentId);
      if (garment.status === 'RETURN_REQUESTED') {
        await this.deps.garments.transition(tx, garment, 'RETURNED', {
          eventType: 'RECEIVED',
          actorId,
          metadata: { returnRequestId: request.id },
        });
      }
    }
    await this.deps.notifications.notify(tx, request.userId, 'RETURN_RECEIVED', {
      returnNumber: request.returnNumber,
    });
    return updated;
  }

  /**
   * Keeps each affected order's status honest: RETURN_REQUESTED while any return involving it is
   * open, RETURNED once every garment line has come back, otherwise DELIVERED again.
   */
  private async settleOrders(tx: Executor, returnRequestId: string, actorId: string): Promise<void> {
    const orderIds = await tx
      .selectDistinct({ orderId: schema.orderItems.orderId })
      .from(schema.returnItems)
      .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.returnItems.orderItemId))
      .where(eq(schema.returnItems.returnRequestId, returnRequestId));
    for (const { orderId } of orderIds) await this.moveOrder(tx, orderId, 'settled', actorId);
  }

  private async moveOrder(
    tx: Executor,
    orderId: string,
    stage: 'requested' | 'settled',
    actorId: string,
  ): Promise<void> {
    const order = await this.deps.orders.lockOrder(tx, orderId);
    if (!order) return;
    if (stage === 'requested') {
      if (order.status === 'DELIVERED')
        await this.deps.orders.transition(tx, order, 'RETURN_REQUESTED', actorId, 'Return requested');
      return;
    }
    if (order.status !== 'RETURN_REQUESTED') return;
    const [open] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.returnItems)
      .innerJoin(schema.returnRequests, eq(schema.returnRequests.id, schema.returnItems.returnRequestId))
      .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.returnItems.orderItemId))
      .where(
        and(
          eq(schema.orderItems.orderId, orderId),
          inArray(schema.returnRequests.status, [
            'REQUESTED',
            'APPROVED',
            'IN_TRANSIT',
            'RECEIVED',
            'INSPECTING',
          ]),
        ),
      );
    if ((open?.n ?? 0) > 0) return;
    const [outstanding] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.orderItems)
      .where(
        and(
          eq(schema.orderItems.orderId, orderId),
          sql`${schema.orderItems.garmentId} is not null`,
          sql`not exists (select 1 from return_items ri join return_requests rr on rr.id = ri.return_request_id
                where ri.order_item_id = ${schema.orderItems.id} and ri.outcome is not null)`,
        ),
      );
    await this.deps.orders.transition(
      tx,
      order,
      (outstanding?.n ?? 0) === 0 ? 'RETURNED' : 'DELIVERED',
      actorId,
      null,
    );
  }

  private async transition(
    tx: Executor,
    request: ReturnRequestRow,
    to: ReturnStatus,
    changes: Partial<typeof schema.returnRequests.$inferInsert> = {},
  ): Promise<ReturnRequestRow> {
    returnLifecycle.assertTransition(request.status, to);
    const [updated] = await tx
      .update(schema.returnRequests)
      .set({ status: to, ...changes })
      .where(and(eq(schema.returnRequests.id, request.id), eq(schema.returnRequests.status, request.status)))
      .returning();
    if (!updated)
      throw new AppError(
        'CONFLICT',
        'The return changed while you were working on it. Please retry.',
        'STALE_RETURN',
      );
    return updated;
  }

  private async lock(tx: Executor, rawId: unknown): Promise<ReturnRequestRow> {
    const parsed = z.uuid().safeParse(rawId);
    if (!parsed.success) throw new AppError('NOT_FOUND', 'Return not found.');
    const [row] = await tx
      .select()
      .from(schema.returnRequests)
      .where(eq(schema.returnRequests.id, parsed.data))
      .for('update');
    if (!row) throw new AppError('NOT_FOUND', 'Return not found.');
    return row;
  }

  private async insertWithUniqueNumber(
    tx: Executor,
    values: Omit<typeof schema.returnRequests.$inferInsert, 'returnNumber'>,
  ): Promise<ReturnRequestRow> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const returnNumber = generateReference('RET');
      const [exists] = await tx
        .select({ id: schema.returnRequests.id })
        .from(schema.returnRequests)
        .where(eq(schema.returnRequests.returnNumber, returnNumber));
      if (exists) continue;
      const [row] = await tx
        .insert(schema.returnRequests)
        .values({ ...values, returnNumber })
        .returning();
      if (row) return row;
    }
    throw new Error('Could not allocate a unique return number');
  }
}
