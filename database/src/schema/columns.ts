import { bigint, char, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Shared column builders so conventions stay identical across every table. */

export const id = () => uuid('id').primaryKey().defaultRandom();

export const tstz = (name: string) => timestamp(name, { withTimezone: true });

export const createdAt = () => tstz('created_at').notNull().defaultNow();

export const updatedAt = () =>
  tstz('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/** Soft deletion: rows are hidden by queries, never physically removed. */
export const deletedAt = () => tstz('deleted_at');

/** Integer minor units. bigint so aggregates cannot overflow; safe as a JS number up to 2^53. */
export const amount = (name: string) => bigint(name, { mode: 'number' });

/** ISO 4217 code that accompanies every amount column. */
export const currency = () => char('currency', { length: 3 }).notNull();
