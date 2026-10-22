import { inArray, like } from 'drizzle-orm';
import type { Executor } from '../src/client';
import * as schema from '../src/schema';

/**
 * Wider development catalogue covering every age group from newborn to 24 months. PLACEHOLDER content for building
 * and demonstrating the shop: names say "(seed)", prices are sample prices, and no material, certificate or
 * sustainability claim is made. Everything is labelled so the placeholder guard (apps/api/src/domain/placeholder-data.ts)
 * finds it and a production database refuses to go live while any is present. No product has a photo yet: add them
 * in the admin (see docs/13-catalogue-and-images.md). Idempotent. Requires seedDevelopmentReference first.
 */

const MARKER = 'SEED';

type Age = 'NB' | 'EI' | 'MI' | 'TD' | 'BT';
const AGE_SIZES: Record<Age, string[]> = {
  NB: ['0-3M'],
  EI: ['3-6M'],
  MI: ['6-9M', '9-12M'],
  TD: ['12-18M'],
  BT: ['18-24M'],
};

const NEW_CATEGORIES = [
  { slug: 'blankets', name: 'Blankets and swaddles' },
  { slug: 'hats', name: 'Hats and mittens' },
  { slug: 'socks', name: 'Socks and booties' },
  { slug: 'bibs', name: 'Bibs' },
  { slug: 'swimwear', name: 'Swimwear' },
  { slug: 'underwear', name: 'Underwear' },
  { slug: 'gift-sets', name: 'Gift sets' },
];

interface Type {
  /** Three letters in the SKU: SEED-NB-BOD-001-... */
  code: string;
  name: string;
  category: string;
  ages: Age[];
  /** Sample price in RWF. */
  price: number;
  colors: string[];
  detail: string;
  subscriptionEligible?: boolean;
}

const TYPES: Type[] = [
  {
    code: 'BOD',
    name: 'Short-sleeve bodysuit',
    category: 'bodysuits',
    ages: ['NB', 'EI', 'MI'],
    price: 8_000,
    colors: ['White', 'Cream', 'Soft pink', 'Sky blue'],
    detail: 'Envelope neck and snap fastening at the bottom.',
  },
  {
    code: 'BDL',
    name: 'Long-sleeve bodysuit',
    category: 'bodysuits',
    ages: ['NB', 'EI', 'MI'],
    price: 9_000,
    colors: ['White', 'Beige', 'Grey'],
    detail: 'Envelope neck and snap fastening at the bottom.',
  },
  {
    code: 'FTS',
    name: 'Footed sleeper',
    category: 'sleepwear',
    ages: ['NB', 'EI', 'MI'],
    price: 12_000,
    colors: ['Cream', 'Sage green', 'Yellow'],
    detail: 'One piece with feet and a zip.',
  },
  {
    code: 'PJS',
    name: 'Two-piece pyjamas',
    category: 'sleepwear',
    ages: ['EI', 'MI', 'TD', 'BT'],
    price: 11_000,
    colors: ['Sky blue', 'Grey', 'Lavender'],
    detail: 'Top and trousers.',
  },
  {
    code: 'PNT',
    name: 'Soft pants',
    category: 'trousers',
    ages: ['NB', 'EI', 'MI'],
    price: 6_500,
    colors: ['Beige', 'Grey', 'Brown'],
    detail: 'Elastic waist.',
  },
  {
    code: 'LEG',
    name: 'Leggings',
    category: 'trousers',
    ages: ['EI', 'MI', 'TD', 'BT'],
    price: 6_000,
    colors: ['Soft pink', 'Sage green', 'Grey'],
    detail: 'Stretch fit.',
  },
  {
    code: 'TRS',
    name: 'Everyday trousers',
    category: 'trousers',
    ages: ['TD', 'BT'],
    price: 8_500,
    colors: ['Beige', 'Brown', 'Grey'],
    detail: 'Elastic waist.',
  },
  {
    code: 'SHT',
    name: 'Short-sleeve T-shirt',
    category: 'shirts',
    ages: ['MI', 'TD', 'BT'],
    price: 6_000,
    colors: ['White', 'Yellow', 'Sky blue'],
    detail: 'Crew neck.',
  },
  {
    code: 'LST',
    name: 'Long-sleeve top',
    category: 'shirts',
    ages: ['MI', 'TD', 'BT'],
    price: 7_500,
    colors: ['Cream', 'Sage green', 'Lavender'],
    detail: 'Crew neck.',
  },
  {
    code: 'ROM',
    name: 'Romper',
    category: 'rompers',
    ages: ['NB', 'EI', 'MI', 'TD'],
    price: 12_500,
    colors: ['Cream', 'Soft pink', 'Sky blue'],
    detail: 'Snap fastening at the legs.',
  },
  {
    code: 'DRS',
    name: 'Dress',
    category: 'dresses',
    ages: ['MI', 'TD', 'BT'],
    price: 14_000,
    colors: ['Yellow', 'Lavender', 'Multicolor'],
    detail: 'Button fastening at the back.',
  },
  {
    code: 'OVR',
    name: 'Dungarees',
    category: 'trousers',
    ages: ['TD', 'BT'],
    price: 15_000,
    colors: ['Brown', 'Grey', 'Sky blue'],
    detail: 'Adjustable shoulder straps.',
  },
  {
    code: 'SWT',
    name: 'Knitted sweater',
    category: 'outerwear',
    ages: ['NB', 'EI', 'MI', 'TD', 'BT'],
    price: 13_000,
    colors: ['Cream', 'Beige', 'Grey'],
    detail: 'Button shoulder for easy dressing.',
  },
  {
    code: 'JKT',
    name: 'Lightweight jacket',
    category: 'outerwear',
    ages: ['NB', 'EI', 'MI', 'TD', 'BT'],
    price: 17_000,
    colors: ['Sage green', 'Grey', 'Yellow'],
    detail: 'Zip front.',
  },
  {
    code: 'RCT',
    name: 'Raincoat',
    category: 'outerwear',
    ages: ['TD', 'BT'],
    price: 18_000,
    colors: ['Yellow', 'Sky blue'],
    detail: 'Water-resistant outer, hood attached by snaps.',
  },
  {
    code: 'SWM',
    name: 'Swimsuit',
    category: 'swimwear',
    ages: ['TD', 'BT'],
    price: 9_000,
    colors: ['Sky blue', 'Multicolor'],
    detail: 'Quick-drying.',
  },
  {
    code: 'SLP',
    name: 'Wearable sleep sack',
    category: 'blankets',
    ages: ['NB', 'EI', 'MI'],
    price: 15_000,
    colors: ['Cream', 'Grey', 'Soft pink'],
    detail: 'Zip front, no loose fabric. Use the size that matches the baby.',
  },
  {
    code: 'SWD',
    name: 'Muslin swaddle',
    category: 'blankets',
    ages: ['NB', 'EI'],
    price: 9_500,
    colors: ['White', 'Sage green', 'Yellow'],
    detail: 'Light, breathable wrap.',
  },
  {
    code: 'BLK',
    name: 'Lightweight blanket',
    category: 'blankets',
    ages: ['EI', 'MI'],
    price: 11_000,
    colors: ['Cream', 'Beige', 'Lavender'],
    detail: 'For the pram or car seat. Never use in a cot with a sleeping baby.',
  },
  {
    code: 'HAT',
    name: 'Soft cap',
    category: 'hats',
    ages: ['NB', 'EI'],
    price: 3_500,
    colors: ['White', 'Cream', 'Soft pink'],
    detail: 'Stretch, no ties.',
  },
  {
    code: 'SUN',
    name: 'Sun hat',
    category: 'hats',
    ages: ['EI', 'MI', 'TD', 'BT'],
    price: 4_500,
    colors: ['Beige', 'Sky blue', 'Yellow'],
    detail: 'Wide brim, chin strap with a quick-release snap.',
  },
  {
    code: 'MIT',
    name: 'Scratch mittens',
    category: 'hats',
    ages: ['NB'],
    price: 2_500,
    colors: ['White', 'Cream'],
    detail: 'Elastic wrist, no ties.',
  },
  {
    code: 'SOC',
    name: 'Socks, 3 pairs',
    category: 'socks',
    ages: ['NB', 'EI', 'MI', 'TD', 'BT'],
    price: 4_500,
    colors: ['Multicolor', 'Grey'],
    detail: 'Pack of three pairs.',
  },
  {
    code: 'BTE',
    name: 'Booties',
    category: 'socks',
    ages: ['NB', 'EI'],
    price: 4_000,
    colors: ['White', 'Soft pink', 'Sky blue'],
    detail: 'Stay-on fit.',
  },
  {
    code: 'GRP',
    name: 'Non-slip socks',
    category: 'socks',
    ages: ['MI', 'TD', 'BT'],
    price: 4_500,
    colors: ['Grey', 'Multicolor'],
    detail: 'Grip soles.',
  },
  {
    code: 'BIB',
    name: 'Bibs, 3 pack',
    category: 'bibs',
    ages: ['NB', 'EI', 'MI', 'TD'],
    price: 5_000,
    colors: ['White', 'Yellow', 'Sage green'],
    detail: 'Snap fastening.',
  },
  {
    code: 'SHO',
    name: 'Soft-soled shoes',
    category: 'shoes',
    ages: ['EI', 'MI'],
    price: 9_000,
    colors: ['Brown', 'Beige'],
    detail: 'Flexible sole for babies who are not yet walking.',
  },
  {
    code: 'FWS',
    name: 'First-walker shoes',
    category: 'shoes',
    ages: ['MI', 'TD'],
    price: 14_000,
    colors: ['Brown', 'Sky blue'],
    detail: 'Flexible sole.',
  },
  {
    code: 'SNK',
    name: 'Toddler sneakers',
    category: 'shoes',
    ages: ['TD', 'BT'],
    price: 16_000,
    colors: ['White', 'Grey'],
    detail: 'Hook-and-loop fastening.',
  },
  {
    code: 'SND',
    name: 'Sandals',
    category: 'shoes',
    ages: ['TD', 'BT'],
    price: 12_000,
    colors: ['Brown', 'Soft pink'],
    detail: 'Adjustable strap.',
  },
  {
    code: 'BOT',
    name: 'Boots',
    category: 'shoes',
    ages: ['TD', 'BT'],
    price: 18_000,
    colors: ['Brown', 'Grey'],
    detail: 'Easy-open fastening.',
  },
  {
    code: 'UND',
    name: 'Training pants, 3 pack',
    category: 'underwear',
    ages: ['BT'],
    price: 9_000,
    colors: ['White', 'Multicolor'],
    detail: 'Pack of three.',
    subscriptionEligible: false,
  },
  {
    code: 'GFT',
    name: 'Gift set',
    category: 'gift-sets',
    ages: ['NB', 'EI', 'MI', 'TD', 'BT'],
    price: 28_000,
    colors: ['Cream', 'Soft pink', 'Sky blue'],
    detail: 'A bodysuit, pants, a cap and a bib arranged as a gift.',
    subscriptionEligible: false,
  },
];

const AGE_ORDER: Age[] = ['NB', 'EI', 'MI', 'TD', 'BT'];

function skuFor(type: Type, color: string, sizeCode: string): string {
  const youngest = AGE_ORDER.find((age) => type.ages.includes(age)) ?? 'NB';
  return `${MARKER}-${youngest}-${type.code}-001-${color.slice(0, 3).toUpperCase()}-${sizeCode.replace(/[^0-9A-Z]/gi, '')}`;
}

export const EXTENDED_SKU_PREFIX = `${MARKER}-`;

export async function seedExtendedCatalogue(db: Executor): Promise<void> {
  await db
    .insert(schema.categories)
    .values(
      NEW_CATEGORIES.map((category, index) => ({
        ...category,
        sortOrder: 20 + index,
        description: `${MARKER} category`,
      })),
    )
    .onConflictDoNothing({ target: schema.categories.slug });
  const categories = await db.select().from(schema.categories);
  const categoryId = (slug: string) => {
    const found = categories.find((row) => row.slug === slug);
    if (!found) throw new Error(`Seed category ${slug} missing; run seedDevelopmentReference first`);
    return found.id;
  };
  const slugFor = (type: Type) => `seed-ext-${type.code.toLowerCase()}`;

  await db
    .insert(schema.products)
    .values(
      TYPES.map((type) => ({
        slug: slugFor(type),
        name: `${type.name} (seed)`,
        description: `${MARKER} product for development. ${type.detail} Placeholder description and price.`,
        brand: 'Bambino',
        categoryId: categoryId(type.category),
        // Deliberately no material or certificate claim: nobody has verified one.
        material: 'Not specified (seed data)',
        sustainabilityInfo: 'Seed data: real sustainability details to be supplied.',
        careInstructions: 'Machine wash cold (seed data).',
        subscriptionEligible: type.subscriptionEligible ?? true,
      })),
    )
    .onConflictDoNothing({ target: schema.products.slug });
  const products = await db
    .select()
    .from(schema.products)
    .where(inArray(schema.products.slug, TYPES.map(slugFor)));
  const productId = new Map(products.map((row) => [row.slug, row.id]));

  const variants = TYPES.flatMap((type) => {
    const id = productId.get(slugFor(type));
    if (!id) return [];
    const sizes = type.ages.flatMap((age) => AGE_SIZES[age]);
    return type.colors.flatMap((color) =>
      sizes.map((sizeCode) => ({
        productId: id,
        sku: skuFor(type, color, sizeCode),
        sizeCode,
        color,
        priceAmount: type.price,
        currency: 'RWF',
      })),
    );
  });
  // In batches: one statement per few hundred rows keeps a remote database fast.
  for (let start = 0; start < variants.length; start += 200) {
    await db
      .insert(schema.productVariants)
      .values(variants.slice(start, start + 200))
      .onConflictDoNothing();
  }

  const stored = await db
    .select({ id: schema.productVariants.id })
    .from(schema.productVariants)
    .where(like(schema.productVariants.sku, `${MARKER}-%-001-%`));
  for (let start = 0; start < stored.length; start += 200) {
    await db
      .insert(schema.inventoryItems)
      .values(
        stored.slice(start, start + 200).map((variant) => ({
          variantId: variant.id,
          locationCode: 'KGL-MAIN',
          quantityOnHand: 10,
          reorderThreshold: 2,
        })),
      )
      .onConflictDoNothing();
  }
}

/** For tests: how many products and variants the extended seed defines. */
export const EXTENDED_COUNTS = {
  products: TYPES.length,
  variants: TYPES.reduce(
    (sum, type) => sum + type.colors.length * type.ages.flatMap((age) => AGE_SIZES[age]).length,
    0,
  ),
};
