import { type Database, schema } from '@bambino/database';
import { ilike, or } from '@bambino/database/orm';

/**
 * Development seed rows (database/seeds) are labelled so they can never be mistaken for real data: codes and slugs
 * start with `seed-`, names say "(seed ...)", and the seed accounts use `@seed.test`. This finds any that are present.
 *
 * Why it exists: a customer must never see "Everyday trousers (seed)", a placeholder price, or a catalogue claim
 * nobody verified. `db:seed` already refuses to add demo data in production; this is the second lock. If a
 * production database ever holds demo rows (a wrong DATABASE_URL, a restored copy of staging), the API reports
 * itself not ready and `launch:check` fails, instead of quietly serving them.
 */
export interface PlaceholderFinding {
  table: string;
  value: string;
}

const NAME_MARKER = '%(seed%';
const CODE_MARKER = 'seed-%';

export async function findPlaceholderData(db: Database, limit = 20): Promise<PlaceholderFinding[]> {
  const findings: PlaceholderFinding[] = [];
  const add = (table: string, values: (string | null)[]) => {
    for (const value of values) if (value) findings.push({ table, value });
  };

  add(
    'products',
    (
      await db
        .select({ value: schema.products.slug })
        .from(schema.products)
        .where(
          or(
            ilike(schema.products.slug, CODE_MARKER),
            ilike(schema.products.name, NAME_MARKER),
            ilike(schema.products.material, '%seed data%'),
          ),
        )
        .limit(limit)
    ).map((row) => row.value),
  );
  add(
    'product_variants',
    (
      await db
        .select({ value: schema.productVariants.sku })
        .from(schema.productVariants)
        .where(ilike(schema.productVariants.sku, CODE_MARKER))
        .limit(limit)
    ).map((row) => row.value),
  );
  add(
    'categories',
    (
      await db
        .select({ value: schema.categories.slug })
        .from(schema.categories)
        .where(or(ilike(schema.categories.slug, CODE_MARKER), ilike(schema.categories.name, NAME_MARKER)))
        .limit(limit)
    ).map((row) => row.value),
  );
  add(
    'sizes',
    (
      await db
        .select({ value: schema.sizes.code })
        .from(schema.sizes)
        .where(or(ilike(schema.sizes.code, CODE_MARKER), ilike(schema.sizes.label, NAME_MARKER)))
        .limit(limit)
    ).map((row) => row.value),
  );
  add(
    'delivery_options',
    (
      await db
        .select({ value: schema.deliveryOptions.code })
        .from(schema.deliveryOptions)
        .where(
          or(
            ilike(schema.deliveryOptions.code, CODE_MARKER),
            ilike(schema.deliveryOptions.name, NAME_MARKER),
          ),
        )
        .limit(limit)
    ).map((row) => row.value),
  );
  add(
    'subscription_plans',
    (
      await db
        .select({ value: schema.subscriptionPlans.code })
        .from(schema.subscriptionPlans)
        .where(
          or(
            ilike(schema.subscriptionPlans.code, CODE_MARKER),
            ilike(schema.subscriptionPlans.name, NAME_MARKER),
          ),
        )
        .limit(limit)
    ).map((row) => row.value),
  );
  add(
    'promotions',
    (
      await db
        .select({ value: schema.promotions.code })
        .from(schema.promotions)
        .where(or(ilike(schema.promotions.code, CODE_MARKER), ilike(schema.promotions.name, NAME_MARKER)))
        .limit(limit)
    ).map((row) => row.value),
  );
  // The seed accounts have known passwords in development: in production they would be an open door.
  add(
    'users',
    (
      await db
        .select({ value: schema.users.email })
        .from(schema.users)
        .where(ilike(schema.users.email, '%@seed.test'))
        .limit(limit)
    ).map((row) => row.value),
  );

  return findings.slice(0, limit);
}

export function describeFindings(findings: PlaceholderFinding[]): string {
  return findings.map((finding) => `${finding.table}: ${finding.value}`).join(', ');
}
