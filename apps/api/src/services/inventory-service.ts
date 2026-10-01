import { type Database, type Executor, schema } from '@bambino/database';
import { and, desc, eq, inArray, sql } from '@bambino/database/orm';
import type { InventoryMovementReason } from '@bambino/types';
import { z } from 'zod';
import { recordAudit } from './audit-service';
import { type ServiceContext, requirePermission } from './context';
import { AppError, parseInput } from './errors';
import { type Page, type PageRequest, decodeOffset, encodeOffset, pageSize } from './pagination';

export const DEFAULT_LOCATION = 'KGL-MAIN';

export type InventoryItemRow = typeof schema.inventoryItems.$inferSelect;

interface Reference {
  type: string;
  id: string;
}

const adjustmentSchema = z.object({
  variantId: z.uuid(),
  locationCode: z.string().trim().min(1).max(40),
  onHandDelta: z.number().int().min(-100_000).max(100_000),
  note: z.string().trim().min(3).max(500),
});

/**
 * Stock of new, sellable units. Every counter change is a row in inventory_movements, and
 * the database refuses reserved > on hand, so stock cannot be oversold even under races.
 */
export class InventoryService {
  constructor(private readonly db: Database) {}

  /** Units that can be ordered now, per variant, across all locations. */
  async availability(db: Executor, variantIds: readonly string[]): Promise<Map<string, number>> {
    if (variantIds.length === 0) return new Map();
    const rows = await db
      .select({
        variantId: schema.inventoryItems.variantId,
        available: sql<number>`sum(${schema.inventoryItems.quantityOnHand} - ${schema.inventoryItems.quantityReserved})::int`,
      })
      .from(schema.inventoryItems)
      .where(inArray(schema.inventoryItems.variantId, [...variantIds]))
      .groupBy(schema.inventoryItems.variantId);
    return new Map(rows.map((row) => [row.variantId, row.available]));
  }

  availabilityOf(variantIds: readonly string[]): Promise<Map<string, number>> {
    return this.availability(this.db, variantIds);
  }

  /** Reserves units at one location that has them all; throws OUT_OF_STOCK otherwise. Call inside a transaction. */
  async reserve(tx: Executor, variantId: string, quantity: number, reference: Reference): Promise<void> {
    const [item] = await tx
      .select()
      .from(schema.inventoryItems)
      .where(
        and(
          eq(schema.inventoryItems.variantId, variantId),
          sql`${schema.inventoryItems.quantityOnHand} - ${schema.inventoryItems.quantityReserved} >= ${quantity}`,
        ),
      )
      .orderBy(desc(sql`${schema.inventoryItems.quantityOnHand} - ${schema.inventoryItems.quantityReserved}`))
      .limit(1)
      .for('update');
    if (!item) throw new AppError('CONFLICT', 'Some items are no longer in stock.', 'OUT_OF_STOCK');
    await this.move(tx, item.id, 'RESERVED', 0, quantity, reference);
  }

  /** Returns reserved units to sale, e.g. when an unpaid order is cancelled or expires. */
  async release(tx: Executor, variantId: string, quantity: number, reference: Reference): Promise<void> {
    await this.settle(tx, variantId, quantity, reference, 'RESERVATION_RELEASED', 0);
  }

  /** A paid order takes reserved units out of stock for good. */
  async commitSale(tx: Executor, variantId: string, quantity: number, reference: Reference): Promise<void> {
    await this.settle(tx, variantId, quantity, reference, 'SOLD', -quantity);
  }

  async adjust(context: ServiceContext, rawInput: unknown): Promise<InventoryItemRow> {
    const actor = requirePermission(context, 'inventory:write');
    const input = parseInput(adjustmentSchema, rawInput);
    return this.db.transaction(async (tx) => {
      const [variant] = await tx
        .select({ id: schema.productVariants.id })
        .from(schema.productVariants)
        .where(eq(schema.productVariants.id, input.variantId));
      if (!variant) throw new AppError('NOT_FOUND', 'Variant not found.');
      await tx
        .insert(schema.inventoryItems)
        .values({ variantId: input.variantId, locationCode: input.locationCode })
        .onConflictDoNothing();
      const [item] = await tx
        .select()
        .from(schema.inventoryItems)
        .where(
          and(
            eq(schema.inventoryItems.variantId, input.variantId),
            eq(schema.inventoryItems.locationCode, input.locationCode),
          ),
        )
        .for('update');
      if (!item) throw new Error('Inventory item missing after upsert');
      if (item.quantityOnHand + input.onHandDelta < item.quantityReserved) {
        throw new AppError('CONFLICT', 'Stock cannot drop below the reserved quantity.', 'BELOW_RESERVED');
      }
      const updated = await this.move(
        tx,
        item.id,
        input.onHandDelta > 0 ? 'STOCK_RECEIVED' : 'ADJUSTMENT',
        input.onHandDelta,
        0,
        null,
        actor.userId,
        input.note,
      );
      await recordAudit(tx, context, {
        action: 'inventory.adjusted',
        entityType: 'inventory_item',
        entityId: item.id,
        previousValue: { quantityOnHand: item.quantityOnHand },
        newValue: { quantityOnHand: updated.quantityOnHand, note: input.note },
      });
      return updated;
    });
  }

  async list(
    context: ServiceContext,
    belowThresholdOnly: boolean,
    request: PageRequest,
  ): Promise<Page<InventoryItemRow>> {
    requirePermission(context, 'inventory:read');
    const size = pageSize(request);
    const offset = decodeOffset(request.after);
    const filter = belowThresholdOnly
      ? sql`${schema.inventoryItems.quantityOnHand} - ${schema.inventoryItems.quantityReserved} <= ${schema.inventoryItems.reorderThreshold}`
      : undefined;
    const rows = await this.db
      .select()
      .from(schema.inventoryItems)
      .where(filter)
      .orderBy(
        sql`${schema.inventoryItems.quantityOnHand} - ${schema.inventoryItems.quantityReserved}`,
        schema.inventoryItems.id,
      )
      .limit(size + 1)
      .offset(offset);
    const [count] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.inventoryItems)
      .where(filter);
    return {
      items: rows.slice(0, size),
      hasNextPage: rows.length > size,
      endCursor: rows.length > 0 ? encodeOffset(offset + Math.min(rows.length, size)) : null,
      totalCount: count?.n ?? 0,
    };
  }

  /** Settles a reservation against whichever locations hold it, oldest-reserved first. */
  private async settle(
    tx: Executor,
    variantId: string,
    quantity: number,
    reference: Reference,
    reason: InventoryMovementReason,
    onHandDeltaTotal: number,
  ): Promise<void> {
    const items = await tx
      .select()
      .from(schema.inventoryItems)
      .where(
        and(
          eq(schema.inventoryItems.variantId, variantId),
          sql`${schema.inventoryItems.quantityReserved} > 0`,
        ),
      )
      .orderBy(desc(schema.inventoryItems.quantityReserved))
      .for('update');
    let remaining = quantity;
    for (const item of items) {
      if (remaining === 0) break;
      const take = Math.min(remaining, item.quantityReserved);
      await this.move(tx, item.id, reason, onHandDeltaTotal === 0 ? 0 : -take, -take, reference);
      remaining -= take;
    }
    if (remaining > 0) throw new Error(`Reservation for variant ${variantId} is short by ${remaining}`);
  }

  private async move(
    tx: Executor,
    inventoryItemId: string,
    reason: InventoryMovementReason,
    onHandDelta: number,
    reservedDelta: number,
    reference: Reference | null,
    actorId: string | null = null,
    note: string | null = null,
  ): Promise<InventoryItemRow> {
    const [updated] = await tx
      .update(schema.inventoryItems)
      .set({
        quantityOnHand: sql`${schema.inventoryItems.quantityOnHand} + ${onHandDelta}`,
        quantityReserved: sql`${schema.inventoryItems.quantityReserved} + ${reservedDelta}`,
      })
      .where(eq(schema.inventoryItems.id, inventoryItemId))
      .returning();
    if (!updated) throw new Error('Inventory item vanished during update');
    await tx.insert(schema.inventoryMovements).values({
      inventoryItemId,
      reason,
      onHandDelta,
      reservedDelta,
      referenceType: reference?.type ?? null,
      referenceId: reference?.id ?? null,
      actorId,
      note,
    });
    return updated;
  }
}
