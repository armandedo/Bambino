import { connectDatabase } from '@bambino/database/client';
import { loadEnv } from '../config/env';
import { loadLocalEnvFile } from '../server/env-file';

/** Applies pending migrations to DATABASE_URL. */
loadLocalEnvFile();
const env = loadEnv();
const connection = connectDatabase(env.DATABASE_URL);
try {
  await connection.migrate();
  process.stdout.write(`Migrations applied (${connection.driver}).\n`);
} finally {
  await connection.close();
}
