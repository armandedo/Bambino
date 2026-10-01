import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { connectDatabase } from './client';

/**
 * A throwaway database with every migration applied.
 *
 * - Default: in-process PostgreSQL (PGlite). No server needed.
 * - With TEST_DATABASE_URL set (e.g. the Docker PostgreSQL from docker-compose.yml): a new,
 *   uniquely named database on that server, dropped again by `close()`. This runs the same
 *   tests against a real server, including real concurrent transactions.
 */
export async function createTestDatabase() {
  const serverUrl = process.env.TEST_DATABASE_URL;
  if (!serverUrl) {
    const connection = connectDatabase('pglite:memory');
    await connection.migrate();
    return { db: connection.db, driver: connection.driver, close: connection.close };
  }

  const name = `bambino_test_${randomBytes(6).toString('hex')}`;
  await adminQuery(serverUrl, `CREATE DATABASE ${name}`);
  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  const connection = connectDatabase(url.toString());
  try {
    await connection.migrate();
  } catch (error) {
    await connection.close();
    await adminQuery(serverUrl, `DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    throw error;
  }
  return {
    db: connection.db,
    driver: connection.driver,
    close: async () => {
      await connection.close();
      await adminQuery(serverUrl, `DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    },
  };
}

/** Runs one statement on the server's maintenance connection. `name` is generated above, never user input. */
async function adminQuery(serverUrl: string, statement: string): Promise<void> {
  const client = new pg.Client({ connectionString: serverUrl });
  await client.connect();
  try {
    await client.query(statement);
  } finally {
    await client.end();
  }
}

export type TestDatabase = Awaited<ReturnType<typeof createTestDatabase>>['db'];
