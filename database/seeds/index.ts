import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, ROLE_KEYS, type RoleKey } from '@bambino/types';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Executor } from '../src/client';
import * as schema from '../src/schema';

/**
 * System seed: roles and permissions. Required in every environment, idempotent,
 * and safe to re-run after the catalogue in @bambino/types changes. It adds missing
 * grants to system roles but never removes grants staff have added.
 */
export async function seedSystem(db: Executor): Promise<void> {
  await db
    .insert(schema.permissions)
    .values(PERMISSIONS.map((key) => ({ key })))
    .onConflictDoNothing({ target: schema.permissions.key });

  await db
    .insert(schema.roles)
    .values(ROLE_KEYS.map((key) => ({ key, name: roleName(key), isSystem: true })))
    .onConflictDoNothing({ target: schema.roles.key });

  const roles = await db
    .select()
    .from(schema.roles)
    .where(inArray(schema.roles.key, [...ROLE_KEYS]));
  const permissions = await db.select().from(schema.permissions);
  const permissionIds = new Map(permissions.map((permission) => [permission.key, permission.id]));

  const grants = roles.flatMap((role) =>
    (DEFAULT_ROLE_PERMISSIONS[role.key as RoleKey] ?? []).map((key) => {
      const permissionId = permissionIds.get(key);
      if (permissionId === undefined) throw new Error(`Permission ${key} missing after seeding`);
      return { roleId: role.id, permissionId };
    }),
  );
  if (grants.length > 0) await db.insert(schema.rolePermissions).values(grants).onConflictDoNothing();
}

function roleName(key: RoleKey): string {
  return key
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Every development seed row carries this marker in its code, slug or name. */
export const SEED_MARKER = 'SEED';

/**
 * Development reference data. PLACEHOLDER values: Bambino's real size chart, plan
 * prices and delivery fees have not been decided (docs/08-open-questions.md), so
 * every row here is labelled and must be replaced before launch. Never run in production.
 */
export async function seedDevelopmentReference(db: Executor): Promise<void> {
  // Ranges are a generic placeholder chart (age in days, height in mm, weight in grams).
  await db
    .insert(schema.sizes)
    .values([
      {
        code: 'NB',
        label: 'Newborn (seed chart)',
        sortOrder: 1,
        minAgeDays: 0,
        maxAgeDays: 30,
        minHeightMm: 0,
        maxHeightMm: 560,
        minWeightG: 0,
        maxWeightG: 4_500,
      },
      {
        code: '0-3M',
        label: '0-3 months (seed chart)',
        sortOrder: 2,
        minAgeDays: 0,
        maxAgeDays: 91,
        minHeightMm: 500,
        maxHeightMm: 620,
        minWeightG: 3_500,
        maxWeightG: 6_500,
      },
      {
        code: '3-6M',
        label: '3-6 months (seed chart)',
        sortOrder: 3,
        minAgeDays: 91,
        maxAgeDays: 182,
        minHeightMm: 610,
        maxHeightMm: 680,
        minWeightG: 6_000,
        maxWeightG: 8_000,
      },
      {
        code: '6-9M',
        label: '6-9 months (seed chart)',
        sortOrder: 4,
        minAgeDays: 182,
        maxAgeDays: 274,
        minHeightMm: 670,
        maxHeightMm: 720,
        minWeightG: 7_500,
        maxWeightG: 9_500,
      },
      {
        code: '9-12M',
        label: '9-12 months (seed chart)',
        sortOrder: 5,
        minAgeDays: 274,
        maxAgeDays: 365,
        minHeightMm: 710,
        maxHeightMm: 770,
        minWeightG: 9_000,
        maxWeightG: 10_500,
      },
      {
        code: '12-18M',
        label: '12-18 months (seed chart)',
        sortOrder: 6,
        minAgeDays: 365,
        maxAgeDays: 548,
        minHeightMm: 760,
        maxHeightMm: 830,
        minWeightG: 10_000,
        maxWeightG: 12_000,
      },
      {
        code: '18-24M',
        label: '18-24 months (seed chart)',
        sortOrder: 7,
        minAgeDays: 548,
        maxAgeDays: 730,
        minHeightMm: 820,
        maxHeightMm: 900,
        minWeightG: 11_500,
        maxWeightG: 13_500,
      },
    ])
    .onConflictDoNothing({ target: schema.sizes.code });

  const categories = [
    'Bodysuits',
    'Rompers',
    'Shirts',
    'Trousers',
    'Dresses',
    'Sleepwear',
    'Outerwear',
    'Accessories',
    'Shoes',
  ];
  await db
    .insert(schema.categories)
    .values(
      categories.map((name, index) => ({
        slug: name.toLowerCase(),
        name,
        sortOrder: index + 1,
        description: `${SEED_MARKER} category`,
      })),
    )
    .onConflictDoNothing({ target: schema.categories.slug });

  await db
    .insert(schema.deliveryOptions)
    .values([
      {
        code: `${SEED_MARKER}-STANDARD`,
        name: 'Standard delivery, Kigali (seed fee)',
        marketCode: 'RW',
        feeAmount: 2_000,
        currency: 'RWF',
        estimatedDaysMin: 1,
        estimatedDaysMax: 3,
      },
      {
        code: `${SEED_MARKER}-EXPRESS`,
        name: 'Same-day delivery, Kigali (seed fee)',
        marketCode: 'RW',
        feeAmount: 4_000,
        currency: 'RWF',
        estimatedDaysMin: 0,
        estimatedDaysMax: 0,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(schema.subscriptionPlans)
    .values([
      {
        code: `${SEED_MARKER}-MONTHLY`,
        name: 'Monthly (seed price)',
        description: `${SEED_MARKER} plan. Placeholder price pending the real price list.`,
        marketCode: 'RW',
        billingInterval: 'MONTHLY',
        priceAmount: 39_000,
        currency: 'RWF',
        itemsPerCycle: 5,
        exchangePolicy: { exchangesPerCycle: 5 },
      },
      {
        code: `${SEED_MARKER}-QUARTERLY`,
        name: 'Quarterly (seed price)',
        description: `${SEED_MARKER} plan. Placeholder price pending the real price list.`,
        marketCode: 'RW',
        billingInterval: 'QUARTERLY',
        priceAmount: 108_000,
        currency: 'RWF',
        itemsPerCycle: 5,
        exchangePolicy: { exchangesPerCycle: null },
      },
      {
        code: `${SEED_MARKER}-ANNUAL`,
        name: 'Annual (seed price)',
        description: `${SEED_MARKER} plan. Placeholder price pending the real price list.`,
        marketCode: 'RW',
        billingInterval: 'ANNUAL',
        priceAmount: 400_000,
        currency: 'RWF',
        itemsPerCycle: 6,
        exchangePolicy: { exchangesPerCycle: null },
      },
    ])
    .onConflictDoNothing({ target: schema.subscriptionPlans.code });
}

/** Grants a role to a user by role key. Idempotent. */
export async function grantRole(db: Executor, userId: string, roleKey: RoleKey): Promise<void> {
  const [role] = await db.select().from(schema.roles).where(eq(schema.roles.key, roleKey));
  if (!role) throw new Error(`Role ${roleKey} does not exist; run seedSystem first`);
  await db.insert(schema.userRoles).values({ userId, roleId: role.id }).onConflictDoNothing();
}

/** Counts rows for a quick post-seed sanity check. */
export async function countSystemRows(db: Executor) {
  const [roles] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.roles);
  const [grants] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.rolePermissions)
    .innerJoin(
      schema.roles,
      and(eq(schema.roles.id, schema.rolePermissions.roleId), eq(schema.roles.isSystem, true)),
    );
  return { roles: roles?.n ?? 0, systemGrants: grants?.n ?? 0 };
}

/**
 * Development catalogue: a few clearly labelled products with stock, and a seed promotion
 * code. PLACEHOLDER content and prices for building the web and mobile apps. Idempotent.
 * Requires seedDevelopmentReference (sizes, categories) first.
 */
export async function seedDevelopmentCatalogue(db: Executor): Promise<void> {
  const categories = await db.select().from(schema.categories);
  const categoryId = (slug: string) => {
    const category = categories.find((row) => row.slug === slug);
    if (!category) throw new Error(`Seed category ${slug} missing; run seedDevelopmentReference first`);
    return category.id;
  };

  const products = [
    {
      slug: 'seed-organic-cotton-bodysuit',
      name: 'Bodysuit (seed)',
      category: 'bodysuits',
      price: 8_500,
      colors: ['Sand', 'Sage'],
    },
    {
      slug: 'seed-footed-romper',
      name: 'Footed romper (seed)',
      category: 'rompers',
      price: 12_000,
      colors: ['Oat'],
    },
    {
      slug: 'seed-sleep-suit',
      name: 'Two-piece sleep suit (seed)',
      category: 'sleepwear',
      price: 10_500,
      colors: ['Cloud'],
    },
    {
      slug: 'seed-everyday-trousers',
      name: 'Everyday trousers (seed)',
      category: 'trousers',
      price: 7_000,
      colors: ['Clay'],
    },
  ];
  const sizes = ['0-3M', '3-6M', '6-9M', '9-12M'];

  for (const seed of products) {
    await db
      .insert(schema.products)
      .values({
        slug: seed.slug,
        name: seed.name,
        description: `${SEED_MARKER} product for development. Placeholder description and price.`,
        brand: 'Bambino',
        categoryId: categoryId(seed.category),
        // Deliberately makes no material claim: demo products must not assert anything nobody has verified.
        material: 'Not specified (seed data)',
        sustainabilityInfo: 'Seed data: real sustainability details to be supplied.',
        careInstructions: 'Machine wash cold (seed data).',
      })
      .onConflictDoNothing({ target: schema.products.slug });
    const [product] = await db.select().from(schema.products).where(eq(schema.products.slug, seed.slug));
    if (!product) continue;

    for (const color of seed.colors) {
      for (const sizeCode of sizes) {
        const sku = `SEED-${seed.slug.slice(5, 13).toUpperCase()}-${color.slice(0, 3).toUpperCase()}-${sizeCode.replace(/[^0-9A-Z]/gi, '')}`;
        await db
          .insert(schema.productVariants)
          .values({ productId: product.id, sku, sizeCode, color, priceAmount: seed.price, currency: 'RWF' })
          .onConflictDoNothing();
        const [variant] = await db
          .select()
          .from(schema.productVariants)
          .where(eq(schema.productVariants.sku, sku));
        if (!variant) continue;
        await db
          .insert(schema.inventoryItems)
          .values({
            variantId: variant.id,
            locationCode: 'KGL-MAIN',
            quantityOnHand: 10,
            reorderThreshold: 2,
          })
          .onConflictDoNothing();

        // Circulating garments for subscriptions and exchanges: three tagged units per variant.
        for (let unit = 1; unit <= 3; unit++) {
          const [garment] = await db
            .insert(schema.garments)
            .values({ tagCode: `${sku}-G${unit}`, variantId: variant.id, status: 'AVAILABLE' })
            .onConflictDoNothing({ target: schema.garments.tagCode })
            .returning();
          if (!garment) continue;
          await db.insert(schema.garmentLifecycleEvents).values([
            {
              garmentId: garment.id,
              eventType: 'PROCURED',
              newStatus: 'PROCURED',
              newCondition: 'NEW',
              metadata: { seed: true },
            },
            {
              garmentId: garment.id,
              eventType: 'CHECKED_IN',
              previousStatus: 'PROCURED',
              newStatus: 'AVAILABLE',
              previousCondition: 'NEW',
              newCondition: 'NEW',
              metadata: { seed: true },
            },
          ]);
        }
      }
    }
  }

  await db
    .insert(schema.promotions)
    .values({
      code: `${SEED_MARKER}10`,
      name: '10% off (seed promotion)',
      scope: 'ORDER',
      discountType: 'PERCENTAGE',
      percentBasisPoints: 1_000,
      currency: 'RWF',
      startsAt: new Date('2026-01-01T00:00:00Z'),
      maxRedemptionsPerUser: 1,
    })
    .onConflictDoNothing();
}
