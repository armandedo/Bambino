import { type Database, type Executor, schema } from '@bambino/database';
import { and, asc, desc, eq, inArray, isNotNull, sql } from '@bambino/database/orm';
import {
  GARMENT_CONDITIONS,
  GARMENT_STATUSES,
  type GarmentCondition,
  type GarmentStatus,
} from '@bambino/types';
import { z } from 'zod';
import { garmentLifecycle } from '../domain/lifecycles';
import { generateReference } from '../domain/references';
import { recordAudit } from './audit-service';
import { type ServiceContext, requirePermission, requireUser } from './context';
import { AppError, parseInput } from './errors';
import { type Page, type PageRequest, decodeOffset, encodeOffset, pageSize } from './pagination';

export type GarmentRow = typeof schema.garments.$inferSelect;
export type GarmentEventRow = typeof schema.garmentLifecycleEvents.$inferSelect;

export interface TransitionOptions {
  eventType: string;
  actorId: string | null;
  condition?: GarmentCondition;
  /** Set when the garment goes to a customer; cleared automatically when it comes back. */
  customerId?: string | null;
  metadata?: Record<string, unknown>;
  countCycle?: boolean;
  inspected?: boolean;
}

const transitionSchema = z.object({
  garmentId: z.uuid(),
  status: z.enum(GARMENT_STATUSES),
  condition: z.enum(GARMENT_CONDITIONS).nullish(),
  note: z.string().trim().max(500).nullish(),
});

/**
 * Statuses staff may set directly. Reservation, delivery and returns move garments through
 * their own flows so the garment always matches the order or return it belongs to.
 */
const STAFF_TARGETS: readonly GarmentStatus[] = [
  'AVAILABLE',
  'REFURBISHING',
  'AVAILABLE_FOR_REUSE',
  'RESALE',
  'RECYCLE',
  'RETIRED',
];

/** Every physical garment's status changes here, with an append-only event per change. */
export class GarmentService {
  constructor(
    private readonly db: Database,
    private readonly now: () => Date,
  ) {}

  async transition(
    tx: Executor,
    garment: GarmentRow,
    to: GarmentStatus,
    options: TransitionOptions,
  ): Promise<GarmentRow> {
    garmentLifecycle.assertTransition(garment.status, to);
    // A garment has a current customer only while it is with them or on its way back.
    const heldByCustomer = to === 'WITH_CUSTOMER' || to === 'RETURN_REQUESTED';
    const customerId =
      options.customerId !== undefined
        ? options.customerId
        : heldByCustomer
          ? garment.currentCustomerId
          : null;
    const [updated] = await tx
      .update(schema.garments)
      .set({
        status: to,
        condition: options.condition ?? garment.condition,
        currentCustomerId: customerId,
        ...(options.countCycle ? { lifecycleCount: garment.lifecycleCount + 1 } : {}),
        ...(options.inspected ? { lastInspectedAt: this.now() } : {}),
        ...(to === 'RETIRED' ? { retiredAt: this.now() } : {}),
      })
      .where(and(eq(schema.garments.id, garment.id), eq(schema.garments.status, garment.status)))
      .returning();
    if (!updated)
      throw new AppError(
        'CONFLICT',
        'The garment changed while you were working on it. Please retry.',
        'STALE_GARMENT',
      );
    await tx.insert(schema.garmentLifecycleEvents).values({
      garmentId: garment.id,
      eventType: options.eventType,
      previousStatus: garment.status,
      newStatus: to,
      previousCondition: garment.condition,
      newCondition: updated.condition,
      actorId: options.actorId,
      metadata: options.metadata ?? null,
      occurredAt: this.now(),
    });
    return updated;
  }

  async lock(tx: Executor, garmentId: string): Promise<GarmentRow> {
    const [garment] = await tx
      .select()
      .from(schema.garments)
      .where(eq(schema.garments.id, garmentId))
      .for('update');
    if (!garment) throw new AppError('NOT_FOUND', 'Garment not found.');
    return garment;
  }

  /**
   * Reserves one garment of a variant for an order. Garments that have circulated before
   * are preferred over new ones, which is the point of the circular model.
   */
  async reserveForVariant(
    tx: Executor,
    variantId: string,
    reference: { type: string; id: string },
  ): Promise<GarmentRow> {
    const [garment] = await tx
      .select()
      .from(schema.garments)
      .where(
        and(
          eq(schema.garments.variantId, variantId),
          inArray(schema.garments.status, ['AVAILABLE_FOR_REUSE', 'AVAILABLE']),
        ),
      )
      .orderBy(
        sql`case when ${schema.garments.status} = 'AVAILABLE_FOR_REUSE' then 0 else 1 end`,
        asc(schema.garments.lifecycleCount),
      )
      .limit(1)
      .for('update', { skipLocked: true });
    if (!garment)
      throw new AppError('CONFLICT', 'That size is not available right now.', 'NO_GARMENT_AVAILABLE');
    return this.transition(tx, garment, 'RESERVED', {
      eventType: 'RESERVED',
      actorId: null,
      metadata: { [`${reference.type}Id`]: reference.id },
    });
  }

  /** Undoes a reservation, back to new or reusable stock depending on the garment's history. */
  async release(tx: Executor, garmentId: string, reason: string): Promise<void> {
    const garment = await this.lock(tx, garmentId);
    if (garment.status !== 'RESERVED') return;
    await this.transition(tx, garment, garment.lifecycleCount === 0 ? 'AVAILABLE' : 'AVAILABLE_FOR_REUSE', {
      eventType: 'RESERVATION_RELEASED',
      actorId: null,
      metadata: { reason },
    });
  }

  async markDelivered(tx: Executor, garmentId: string, customerId: string, orderId: string): Promise<void> {
    const garment = await this.lock(tx, garmentId);
    if (garment.status !== 'RESERVED') return;
    await this.transition(tx, garment, 'WITH_CUSTOMER', {
      eventType: 'DELIVERED',
      actorId: null,
      customerId,
      metadata: { orderId },
    });
  }

  /** Garments the customer holds now, including any already in an open return. */
  async listHeldBy(context: ServiceContext): Promise<GarmentRow[]> {
    const actor = requireUser(context);
    return this.db
      .select()
      .from(schema.garments)
      .where(
        and(
          eq(schema.garments.currentCustomerId, actor.userId),
          inArray(schema.garments.status, ['WITH_CUSTOMER', 'RETURN_REQUESTED']),
        ),
      )
      .orderBy(asc(schema.garments.tagCode));
  }

  async byIds(ids: readonly string[]): Promise<GarmentRow[]> {
    return ids.length
      ? this.db
          .select()
          .from(schema.garments)
          .where(inArray(schema.garments.id, [...ids]))
      : [];
  }

  /** Garments that could be reserved now, per variant (the same statuses reserveForVariant picks from). */
  async reservableCounts(variantIds: readonly string[]): Promise<Map<string, number>> {
    if (variantIds.length === 0) return new Map();
    const rows = await this.db
      .select({ variantId: schema.garments.variantId, n: sql<number>`count(*)::int` })
      .from(schema.garments)
      .where(
        and(
          inArray(schema.garments.variantId, [...variantIds]),
          inArray(schema.garments.status, ['AVAILABLE_FOR_REUSE', 'AVAILABLE']),
        ),
      )
      .groupBy(schema.garments.variantId);
    return new Map(rows.map((row) => [row.variantId, row.n]));
  }

  async eventsFor(garmentIds: readonly string[]): Promise<GarmentEventRow[]> {
    if (garmentIds.length === 0) return [];
    return this.db
      .select()
      .from(schema.garmentLifecycleEvents)
      .where(inArray(schema.garmentLifecycleEvents.garmentId, [...garmentIds]))
      .orderBy(asc(schema.garmentLifecycleEvents.sequence));
  }

  /** When each garment last reached the customer. */
  async deliveredAt(garmentIds: readonly string[]): Promise<Map<string, Date>> {
    if (garmentIds.length === 0) return new Map();
    const rows = await this.db
      .select({
        garmentId: schema.garmentLifecycleEvents.garmentId,
        at: sql<Date>`max(${schema.garmentLifecycleEvents.occurredAt})`,
      })
      .from(schema.garmentLifecycleEvents)
      .where(
        and(
          inArray(schema.garmentLifecycleEvents.garmentId, [...garmentIds]),
          eq(schema.garmentLifecycleEvents.newStatus, 'WITH_CUSTOMER'),
        ),
      )
      .groupBy(schema.garmentLifecycleEvents.garmentId);
    return new Map(rows.map((row) => [row.garmentId, new Date(row.at)]));
  }

  // --- staff ------------------------------------------------------------------

  /** Registers newly received garments with unique tag codes, ready for use. */
  async register(
    context: ServiceContext,
    rawVariantId: unknown,
    rawQuantity: unknown,
  ): Promise<GarmentRow[]> {
    const actor = requirePermission(context, 'garment:write');
    const variantId = parseInput(z.uuid(), rawVariantId);
    const quantity = parseInput(z.number().int().min(1).max(200), rawQuantity);
    return this.db.transaction(async (tx) => {
      const [variant] = await tx
        .select({ id: schema.productVariants.id })
        .from(schema.productVariants)
        .where(eq(schema.productVariants.id, variantId));
      if (!variant) throw new AppError('NOT_FOUND', 'Variant not found.');
      const created: GarmentRow[] = [];
      for (let index = 0; index < quantity; index++) {
        const garment = await this.insertWithUniqueTag(tx, variantId);
        await tx.insert(schema.garmentLifecycleEvents).values({
          garmentId: garment.id,
          eventType: 'PROCURED',
          newStatus: 'PROCURED',
          newCondition: 'NEW',
          actorId: actor.userId,
          occurredAt: this.now(),
        });
        created.push(
          await this.transition(tx, garment, 'AVAILABLE', { eventType: 'CHECKED_IN', actorId: actor.userId }),
        );
      }
      await recordAudit(tx, context, {
        action: 'garment.registered',
        entityType: 'product_variant',
        entityId: variantId,
        newValue: { quantity },
      });
      return created;
    });
  }

  async transitionAsStaff(context: ServiceContext, rawInput: unknown): Promise<GarmentRow> {
    const actor = requirePermission(context, 'garment:write');
    const input = parseInput(transitionSchema, rawInput);
    if (!STAFF_TARGETS.includes(input.status)) {
      throw new AppError(
        'VALIDATION_FAILED',
        'This status is set by orders and returns, not by hand.',
        'STATUS_NOT_SETTABLE',
      );
    }
    return this.db.transaction(async (tx) => {
      const garment = await this.lock(tx, input.garmentId);
      const updated = await this.transition(tx, garment, input.status, {
        eventType: 'STAFF_UPDATE',
        actorId: actor.userId,
        ...(input.condition ? { condition: input.condition } : {}),
        metadata: input.note ? { note: input.note } : {},
      });
      await recordAudit(tx, context, {
        action: 'garment.status_changed',
        entityType: 'garment',
        entityId: garment.id,
        previousValue: { status: garment.status, condition: garment.condition },
        newValue: { status: updated.status, condition: updated.condition, note: input.note ?? null },
      });
      return updated;
    });
  }

  async findForStaff(
    context: ServiceContext,
    lookup: { id?: string | null; tagCode?: string | null },
  ): Promise<GarmentRow | null> {
    requirePermission(context, 'garment:read');
    if (lookup.id && z.uuid().safeParse(lookup.id).success) {
      const [garment] = await this.db.select().from(schema.garments).where(eq(schema.garments.id, lookup.id));
      return garment ?? null;
    }
    if (lookup.tagCode) {
      const [garment] = await this.db
        .select()
        .from(schema.garments)
        .where(eq(schema.garments.tagCode, lookup.tagCode.trim().toUpperCase()));
      return garment ?? null;
    }
    return null;
  }

  async listForStaff(
    context: ServiceContext,
    filter: { status?: GarmentStatus | null; variantId?: string | null },
    request: PageRequest,
  ): Promise<Page<GarmentRow> & { totalCount: number }> {
    requirePermission(context, 'garment:read');
    const size = pageSize(request);
    const offset = decodeOffset(request.after);
    const where = and(
      filter.status ? eq(schema.garments.status, filter.status) : undefined,
      filter.variantId ? eq(schema.garments.variantId, filter.variantId) : undefined,
    );
    const rows = await this.db
      .select()
      .from(schema.garments)
      .where(where)
      .orderBy(desc(schema.garments.updatedAt), asc(schema.garments.id))
      .limit(size + 1)
      .offset(offset);
    const [count] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.garments)
      .where(where);
    const items = rows.slice(0, size);
    return {
      items,
      hasNextPage: rows.length > size,
      endCursor: items.length ? encodeOffset(offset + items.length) : null,
      totalCount: count?.n ?? 0,
    };
  }

  /** Garments currently out with customers, for metrics. */
  async countInCirculation(db: Executor = this.db): Promise<number> {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.garments)
      .where(isNotNull(schema.garments.currentCustomerId));
    return row?.n ?? 0;
  }

  private async insertWithUniqueTag(tx: Executor, variantId: string): Promise<GarmentRow> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const tagCode = generateReference('BMBG');
      const [exists] = await tx
        .select({ id: schema.garments.id })
        .from(schema.garments)
        .where(eq(schema.garments.tagCode, tagCode));
      if (exists) continue;
      const [garment] = await tx
        .insert(schema.garments)
        .values({ tagCode, variantId, procuredAt: this.now() })
        .returning();
      if (garment) return garment;
    }
    throw new Error('Could not allocate a unique garment tag');
  }
}
