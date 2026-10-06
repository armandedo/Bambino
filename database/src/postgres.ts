import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { Database } from './client';
import * as schema from './schema';

/**
 * One PostgreSQL connection for one unit of work, for serverless runtimes (Cloudflare Workers with Hyperdrive,
 * which pools the real connections). No migrator and no PGlite, so the bundle stays small.
 */
export async function connectOnce(
  connectionString: string,
): Promise<{ db: Database; close: () => Promise<void> }> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  return { db: drizzle(client, { schema }) as unknown as Database, close: () => client.end() };
}
