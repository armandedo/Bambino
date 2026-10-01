import { sql } from 'drizzle-orm';
import { bigint, check, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { productVariants } from './catalogue';
import { createdAt, id, tstz, updatedAt } from './columns';
import { garmentCondition, garmentStatus } from './enums';
import { users } from './identity';

/**
 * One row per physical garment in the circular pool. SKU, product and size come
 * from the variant. Rows are never deleted (enforced by a trigger in the
 * integrity migration); a garment leaves circulation by reaching RETIRED.
 */
export const garments = pgTable(
  'garments',
  {
    id: id(),
    /** Human- and scanner-readable identifier printed on the garment tag. */
    tagCode: text('tag_code').notNull(),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),
    status: garmentStatus('status').notNull().default('PROCURED'),
    condition: garmentCondition('condition').notNull().default('NEW'),
    /** Number of completed customer cycles (incremented when a return is accepted). */
    lifecycleCount: integer('lifecycle_count').notNull().default(0),
    currentCustomerId: uuid('current_customer_id').references(() => users.id, { onDelete: 'restrict' }),
    procuredAt: tstz('procured_at').notNull().defaultNow(),
    lastInspectedAt: tstz('last_inspected_at'),
    retiredAt: tstz('retired_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('garments_tag_code_uq').on(t.tagCode),
    index('garments_variant_status_idx').on(t.variantId, t.status),
    index('garments_status_idx').on(t.status),
    index('garments_current_customer_idx').on(t.currentCustomerId),
    check('garments_lifecycle_count_non_negative', sql`${t.lifecycleCount} >= 0`),
    check(
      'garments_customer_matches_status',
      sql`${t.currentCustomerId} IS NOT NULL OR ${t.status} NOT IN ('WITH_CUSTOMER', 'RETURN_REQUESTED')`,
    ),
  ],
);

/** Append-only history of every status or condition change (UPDATE/DELETE blocked by trigger). */
export const garmentLifecycleEvents = pgTable(
  'garment_lifecycle_events',
  {
    id: id(),
    garmentId: uuid('garment_id')
      .notNull()
      .references(() => garments.id, { onDelete: 'restrict' }),
    eventType: text('event_type').notNull(),
    previousStatus: garmentStatus('previous_status'),
    newStatus: garmentStatus('new_status').notNull(),
    previousCondition: garmentCondition('previous_condition'),
    newCondition: garmentCondition('new_condition').notNull(),
    /** Null when the system (a job or webhook) caused the change. */
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'restrict' }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    occurredAt: tstz('occurred_at').notNull().defaultNow(),
    /** Total order of events, even when timestamps are equal. */
    sequence: bigint('sequence', { mode: 'number' }).generatedAlwaysAsIdentity(),
  },
  (t) => [index('garment_lifecycle_events_garment_idx').on(t.garmentId, t.occurredAt)],
);
