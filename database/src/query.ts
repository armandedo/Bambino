import type { SQL } from 'drizzle-orm';
import type { Executor } from './client';

/**
 * Runs raw SQL and returns its rows. Both drivers return `{ rows }`, but the shared
 * Database type cannot express that, so the shape is asserted in this one place.
 * Kept free of driver imports so the Cloudflare Worker bundle does not include PGlite.
 */
export async function queryRows<T>(db: Executor, query: SQL): Promise<T[]> {
  const result = (await db.execute(query)) as unknown as { rows: T[] };
  return result.rows;
}
