import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, ROLE_KEYS } from '@bambino/types';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryRows } from '../src/client';
import { type TestDatabase, createTestDatabase } from '../src/testing';
import {
  EXTENDED_COUNTS,
  countSystemRows,
  seedDevelopmentCatalogue,
  seedDevelopmentReference,
  seedExtendedCatalogue,
  seedSystem,
} from './index';

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

  it('load the extended catalogue idempotently: every age group has products, all labelled, all with stock', async () => {
    await seedDevelopmentReference(db);
    await seedDevelopmentCatalogue(db);
    await seedExtendedCatalogue(db);
    await seedExtendedCatalogue(db);

    const products = await queryRows<{ slug: string; name: string; material: string }>(
      db,
      sql`SELECT slug, name, material FROM products WHERE slug LIKE 'seed-ext-%'`,
    );
    expect(products).toHaveLength(EXTENDED_COUNTS.products);
    for (const product of products) {
      expect(product.name).toMatch(/\(seed\)$/);
      expect(product.material).toMatch(/seed data/);
    }

    const variants = await queryRows<{ n: number }>(
      db,
      sql`SELECT count(*)::int AS n FROM product_variants WHERE sku LIKE 'SEED-%-001-%'`,
    );
    expect(variants[0]?.n).toBe(EXTENDED_COUNTS.variants);

    // Every size, hence every age group, has products to buy.
    const bySize = await queryRows<{ size_code: string; n: number }>(
      db,
      sql`SELECT size_code, count(DISTINCT product_id)::int AS n FROM product_variants WHERE sku LIKE 'SEED-%-001-%' GROUP BY size_code`,
    );
    expect(bySize.map((row) => row.size_code).sort()).toEqual([
      '0-3M',
      '12-18M',
      '18-24M',
      '3-6M',
      '6-9M',
      '9-12M',
    ]);
    for (const row of bySize) expect(row.n).toBeGreaterThan(8);

    const noStock = await queryRows<{ n: number }>(
      db,
      sql`SELECT count(*)::int AS n FROM product_variants v LEFT JOIN inventory_items i ON i.variant_id = v.id WHERE v.sku LIKE 'SEED-%-001-%' AND i.id IS NULL`,
    );
    expect(noStock[0]?.n).toBe(0);
  });
});
