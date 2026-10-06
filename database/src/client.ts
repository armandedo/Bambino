import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import { migrate as migrateNodePg } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import pg from 'pg';
import * as schema from './schema';

export type Schema = typeof schema;

/** Driver-independent handle used by every repository. */
export type Database = PgDatabase<PgQueryResultHKT, Schema>;

/** A transaction handle, accepted wherever a Database is. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export type Executor = Database | Transaction;

export interface DatabaseConnection {
  readonly db: Database;
  readonly driver: 'postgres' | 'pglite';
  migrate(): Promise<void>;
  close(): Promise<void>;
}

export { queryRows } from './query';

export const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));

/**
 * Connects from a URL.
 * - `postgres://` / `postgresql://`: a real PostgreSQL server (the only option allowed in production).
 * - `pglite:memory`: throwaway in-process PostgreSQL, for tests.
 * - `pglite:<directory>`: in-process PostgreSQL persisted to disk, for local development without a server.
 */
export function connectDatabase(url: string): DatabaseConnection {
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    const pool = new pg.Pool({ connectionString: url, max: 10 });
    const db = drizzleNodePg(pool, { schema });
    return {
      db: db as unknown as Database,
      driver: 'postgres',
      migrate: () => migrateNodePg(db, { migrationsFolder }),
      close: () => pool.end(),
    };
  }

  if (url.startsWith('pglite:')) {
    const location = url.slice('pglite:'.length);
    if (location !== 'memory') mkdirSync(location, { recursive: true });
    const client = location === 'memory' ? new PGlite() : new PGlite(location);
    const db = drizzlePglite(client, { schema });
    return {
      db: db as unknown as Database,
      driver: 'pglite',
      migrate: () => migratePglite(db, { migrationsFolder }),
      close: () => client.close(),
    };
  }

  throw new Error('DATABASE_URL must start with postgres://, postgresql:// or pglite:');
}
