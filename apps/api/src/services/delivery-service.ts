import { type Database, type Executor, schema } from '@bambino/database';
import { and, asc, desc, eq, inArray, sql } from '@bambino/database/orm';
import { DELIVERY_STATUSES, type DeliveryStatus } from '@bambino/types';
import { z } from 'zod';
import { deliveryLifecycle } from '../domain/lifecycles';
import type { DeliveryProvider } from '../providers/delivery';
import { recordAudit } from './audit-service';
import { type ServiceContext, requirePermission } from './context';
import { AppError, parseInput } from './errors';
import type { NotificationService } from './notification-service';
import type { OrderRow, OrderService } from './order-service';
import type { AddressSnapshot } from '@bambino/database';
import { type Page, type PageRequest, decodeOffset, encodeOffset, pageSize } from './pagination';

export type DeliveryRow = typeof schema.deliveries.$inferSelect;
export type DeliveryEventRow = typeof schema.deliveryEvents.$inferSelect;

const updateSchema = z.object({
  deliveryId: z.uuid(),
  status: z.enum(DELIVERY_STATUSES),
  trackingNumber: z.string().trim().max(60).nullish(),
  estimatedDeliveryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  note: z.string().trim().max(500).nullish(),
});

/**
 * Shipments and pickups. A delivery's progress drives the order: in transit makes the order
 * OUT_FOR_DELIVERY, delivered makes it DELIVERED, a failed attempt sends it back to dispatch.
 */
export type PickupHook = (
  tx: Executor,
  delivery: DeliveryRow,
  status: DeliveryStatus,
  actorId: string,
) => Promise<void>;

export class DeliveryService {
  private orders: OrderService | undefined;
  private readonly pickupHooks: PickupHook[] = [];

  constructor(
    private readonly db: Database,
    private readonly provider: DeliveryProvider,
    private readonly notifications: NotificationService,
    private readonly now: () => Date,
  ) {}

  /** Wired after construction because orders and deliveries call each other. */
  attachOrders(orders: OrderService): void {
    this.orders = orders;
  }

  /** Lets the returns flow follow its pickup deliveries. */
  onPickupStatus(hook: PickupHook): void {
    this.pickupHooks.push(hook);
  }

  /** A collection run for a return, created when the customer asks to be picked up. */
  async createPickup(
    tx: Executor,
    input: { returnRequestId: string; address: AddressSnapshot },
  ): Promise<DeliveryRow> {
    const shipment = await this.provider.createShipment({
      orderNumber: input.returnRequestId,
      district: input.address.district,
    });
    const [delivery] = await tx
      .insert(schema.deliveries)
      .values({
        direction: 'RETURN_PICKUP',
        returnRequestId: input.returnRequestId,
        address: input.address,
        phone: input.address.phone,
        deliveryProvider: this.provider.key,
        trackingNumber: shipment.trackingNumber,
        status: 'PENDING',
      })
      .returning();
    if (!delivery) throw new Error('Pickup insert returned no row');
    await tx.insert(schema.deliveryEvents).values({ deliveryId: delivery.id, status: 'PENDING' });
    return delivery;
  }

  async cancelPickupsFor(tx: Executor, returnRequestId: string): Promise<void> {
    const open = await tx
      .select()
      .from(schema.deliveries)
      .where(
        and(
          eq(schema.deliveries.returnRequestId, returnRequestId),
          inArray(schema.deliveries.status, ['PENDING', 'ASSIGNED']),
        ),
      );
    for (const delivery of open) {
      await tx
        .update(schema.deliveries)
        .set({ status: 'CANCELLED' })
        .where(eq(schema.deliveries.id, delivery.id));
      await tx
        .insert(schema.deliveryEvents)
        .values({ deliveryId: delivery.id, status: 'CANCELLED', note: 'Return rejected' });
    }
  }

  async pickupsFor(returnRequestIds: readonly string[]): Promise<DeliveryRow[]> {
    if (returnRequestIds.length === 0) return [];
    return this.db
      .select()
      .from(schema.deliveries)
      .where(
        and(
          inArray(schema.deliveries.returnRequestId, [...returnRequestIds]),
          eq(schema.deliveries.direction, 'RETURN_PICKUP'),
        ),
      )
      .orderBy(asc(schema.deliveries.createdAt));
  }

  /** Called inside the payment transaction when an order becomes PAID. */
  async createForOrder(tx: Executor, order: OrderRow): Promise<DeliveryRow> {
    const [option] = await tx
      .select()
      .from(schema.deliveryOptions)
      .where(eq(schema.deliveryOptions.code, order.deliveryOptionCode));
    const shipment = await this.provider.createShipment({
      orderNumber: order.orderNumber,
      district: order.shippingAddress.district,
    });
    const estimate = option ? new Date(this.now().getTime() + option.estimatedDaysMax * 86_400_000) : null;
    const [delivery] = await tx
      .insert(schema.deliveries)
      .values({
        direction: 'OUTBOUND',
        orderId: order.id,
        address: order.shippingAddress,
        phone: order.shippingAddress.phone,
        deliveryProvider: this.provider.key,
        trackingNumber: shipment.trackingNumber,
        status: 'PENDING',
        estimatedDeliveryDate: estimate ? estimate.toISOString().slice(0, 10) : null,
      })
      .returning();
    if (!delivery) throw new Error('Delivery insert returned no row');
    await tx.insert(schema.deliveryEvents).values({ deliveryId: delivery.id, status: 'PENDING' });
    return delivery;
  }

  async updateAsStaff(context: ServiceContext, rawInput: unknown): Promise<DeliveryRow> {
    const actor = requirePermission(context, 'delivery:write');
    const input = parseInput(updateSchema, rawInput);
    const orders = this.requireOrders();
    return this.db.transaction(async (tx) => {
      const [delivery] = await tx
        .select()
        .from(schema.deliveries)
        .where(eq(schema.deliveries.id, input.deliveryId))
        .for('update');
      if (!delivery) throw new AppError('NOT_FOUND', 'Delivery not found.');

      if (input.status !== delivery.status) {
        deliveryLifecycle.assertTransition(delivery.status, input.status);
        if (delivery.direction === 'OUTBOUND' && delivery.orderId) {
          await this.syncOrder(tx, orders, delivery.orderId, input.status, actor.userId);
        } else if (delivery.direction === 'RETURN_PICKUP') {
          for (const hook of this.pickupHooks) await hook(tx, delivery, input.status, actor.userId);
        }
      }

      const [updated] = await tx
        .update(schema.deliveries)
        .set({
          status: input.status,
          ...(input.trackingNumber ? { trackingNumber: input.trackingNumber } : {}),
          ...(input.estimatedDeliveryDate ? { estimatedDeliveryDate: input.estimatedDeliveryDate } : {}),
          ...(input.status === 'DELIVERED' ? { deliveredAt: this.now() } : {}),
        })
        .where(eq(schema.deliveries.id, delivery.id))
        .returning();
      if (!updated) throw new Error('Delivery vanished during update');
      await tx.insert(schema.deliveryEvents).values({
        deliveryId: delivery.id,
        status: input.status,
        note: input.note ?? null,
        actorId: actor.userId,
      });
      await recordAudit(tx, context, {
        action: 'delivery.updated',
        entityType: 'delivery',
        entityId: delivery.id,
        previousValue: { status: delivery.status },
        newValue: { status: input.status, note: input.note ?? null },
      });
      return updated;
    });
  }

  async listForStaff(
    context: ServiceContext,
    status: DeliveryStatus | null | undefined,
    request: PageRequest,
  ): Promise<Page<DeliveryRow & { orderNumber: string | null }> & { totalCount: number }> {
    requirePermission(context, 'delivery:read');
    const size = pageSize(request);
    const offset = decodeOffset(request.after);
    const where = status ? eq(schema.deliveries.status, status) : undefined;
    const rows = await this.db
      .select({ delivery: schema.deliveries, orderNumber: schema.orders.orderNumber })
      .from(schema.deliveries)
      .leftJoin(schema.orders, eq(schema.orders.id, schema.deliveries.orderId))
      .where(where)
      .orderBy(desc(schema.deliveries.createdAt), desc(schema.deliveries.id))
      .limit(size + 1)
      .offset(offset);
    const [count] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.deliveries)
      .where(where);
    const items = rows.slice(0, size).map((row) => ({ ...row.delivery, orderNumber: row.orderNumber }));
    return {
      items,
      hasNextPage: rows.length > size,
      endCursor: items.length ? encodeOffset(offset + items.length) : null,
      totalCount: count?.n ?? 0,
    };
  }

  async outboundForOrders(orderIds: readonly string[]): Promise<DeliveryRow[]> {
    if (orderIds.length === 0) return [];
    return this.db
      .select()
      .from(schema.deliveries)
      .where(
        and(inArray(schema.deliveries.orderId, [...orderIds]), eq(schema.deliveries.direction, 'OUTBOUND')),
      )
      .orderBy(asc(schema.deliveries.createdAt));
  }

  async eventsFor(deliveryIds: readonly string[]): Promise<DeliveryEventRow[]> {
    if (deliveryIds.length === 0) return [];
    return this.db
      .select()
      .from(schema.deliveryEvents)
      .where(inArray(schema.deliveryEvents.deliveryId, [...deliveryIds]))
      .orderBy(asc(schema.deliveryEvents.sequence));
  }

  private async syncOrder(
    tx: Executor,
    orders: OrderService,
    orderId: string,
    status: DeliveryStatus,
    actorId: string,
  ) {
    const order = await orders.lockOrder(tx, orderId);
    if (!order) return;
    if (status === 'IN_TRANSIT') {
      if (order.status !== 'READY_FOR_DISPATCH') {
        throw new AppError('CONFLICT', 'The order must be ready for dispatch first.', 'ORDER_NOT_READY');
      }
      await orders.transition(tx, order, 'OUT_FOR_DELIVERY', actorId, null);
      await this.notifications.notify(tx, order.userId, 'ORDER_SHIPPED', { orderNumber: order.orderNumber });
    } else if (status === 'DELIVERED') {
      const delivered = await orders.transition(tx, order, 'DELIVERED', actorId, null);
      await orders.runDeliveredHooks(tx, delivered);
      await this.notifications.notify(tx, order.userId, 'ORDER_DELIVERED', {
        orderNumber: order.orderNumber,
      });
      await tx.insert(schema.analyticsEvents).values({
        eventName: 'ORDER_DELIVERED',
        userId: order.userId,
        properties: { orderId },
        occurredAt: this.now(),
      });
    } else if (status === 'FAILED' && order.status === 'OUT_FOR_DELIVERY') {
      await orders.transition(tx, order, 'READY_FOR_DISPATCH', actorId, 'Delivery attempt failed');
    }
  }

  private requireOrders(): OrderService {
    if (!this.orders) throw new Error('DeliveryService used before attachOrders');
    return this.orders;
  }
}
