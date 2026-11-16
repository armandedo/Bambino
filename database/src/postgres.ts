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
  // A connection closed by the server between queries is emitted as an 'error' event; with no listener that
  // would be an uncaught exception. The next query on this client reports the failure to its caller instead.
  client.on('error', (error) => {
    console.warn(`database: the connection was closed (${error.message})`);
  });
  await client.connect();
  return { db: drizzle(client, { schema }) as unknown as Database, close: () => client.end() };
}

/**
 * A small pool for a serverless function that stays warm between requests (Vercel). Point it at the database's
 * pooled endpoint (for Neon, the "-pooler" host): each function instance then holds a few cheap pooler
 * connections, and the pooler holds the real ones. Idle connections are dropped quickly so a paused instance
 * does not sit on them.
 */
export function connectPool(
  connectionString: string,
  options: { max?: number; idleTimeoutMillis?: number } = {},
): { db: Database; close: () => Promise<void> } {
  const pool = new pg.Pool({
    connectionString,
    max: options.max ?? 3,
    idleTimeoutMillis: options.idleTimeoutMillis ?? 5_000,
    connectionTimeoutMillis: 10_000,
  });
  // See connectOnce: a connection closed by the server must not become an uncaught exception.
  pool.on('error', (error) => {
    console.warn(`database pool: an idle connection was closed (${error.message})`);
  });
  return { db: drizzle(pool, { schema }) as unknown as Database, close: () => pool.end() };
}
