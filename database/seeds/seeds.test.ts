import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, ROLE_KEYS } from '@bambino/types';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryRows } from '../src/client';
import { type TestDatabase, createTestDatabase } from '../src/testing';
import { countSystemRows, seedDevelopmentReference, seedSystem } from './index';

let db: TestDatabase;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
}, 60_000);

afterAll(async () => {
  await close();
});

const expectedGrants = ROLE_KEYS.reduce((total, role) => total + DEFAULT_ROLE_PERMISSIONS[role].length, 0);

describe('seeds', () => {
  it('create every role, permission and default grant, and can be re-run', async () => {
    await seedSystem(db);
    await seedSystem(db);
    expect(await countSystemRows(db)).toEqual({ roles: ROLE_KEYS.length, systemGrants: expectedGrants });
    const permissions = await queryRows<{ n: number }>(db, sql`SELECT count(*)::int AS n FROM permissions`);
    expect(permissions[0]?.n).toBe(PERMISSIONS.length);
  });

  it('load development reference data idempotently, with every row labelled', async () => {
    await seedDevelopmentReference(db);
    await seedDevelopmentReference(db);
    const plans = await queryRows<{ code: string; name: string }>(
      db,
      sql`SELECT code, name FROM subscription_plans`,
    );
    expect(plans).toHaveLength(3);
    for (const plan of plans) expect(plan.code).toMatch(/^SEED-/);
    const sizes = await queryRows<{ label: string }>(db, sql`SELECT label FROM sizes`);
    for (const size of sizes) expect(size.label).toMatch(/seed chart/);
    const options = await queryRows<{ code: string }>(db, sql`SELECT code FROM delivery_options`);
    for (const option of options) expect(option.code).toMatch(/^SEED-/);
  });
});
