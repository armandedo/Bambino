import { defineConfig } from 'vitest/config';

/**
 * Default: in-process PGlite, full parallelism, standard timeouts.
 * With TEST_DATABASE_URL (a real PostgreSQL server, e.g. Docker): every test file creates
 * and drops its own database, so files run two at a time with longer timeouts to avoid
 * overloading the server, not because individual tests are slow.
 */
const realServer = Boolean(process.env.TEST_DATABASE_URL);

export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 120_000,
    ...(realServer ? { maxWorkers: 2 } : {}),
  },
});
