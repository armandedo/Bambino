import { defineConfig } from 'drizzle-kit';

// `generate` only diffs the schema against the migration snapshots, so no database
// connection is needed. Applying migrations to a real server arrives with the API in Phase 3.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
});
