import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { amount, createdAt, currency, deletedAt, id, updatedAt } from './columns';
import { inventoryMovementReason, mediaPurpose } from './enums';
import { users } from './identity';

/**
 * Size chart. The rules-based sizing provider reads its ranges from here, so
 * staff can tune sizing without a deployment. Lengths in mm, weight in grams.
 */
export const sizes = pgTable(
  'sizes',
  {
    code: text('code').primaryKey(),
    label: text('label').notNull(),
    sortOrder: integer('sort_order').notNull(),
    minAgeDays: integer('min_age_days'),
    maxAgeDays: integer('max_age_days'),
    minHeightMm: integer('min_height_mm'),
    maxHeightMm: integer('max_height_mm'),
    minWeightG: integer('min_weight_g'),
    maxWeightG: integer('max_weight_g'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('sizes_sort_order_uq').on(t.sortOrder)],
);

export const categories = pgTable(
  'categories',
  {
    id: id(),
    parentId: uuid('parent_id').references((): AnyPgColumn => categories.id, { onDelete: 'restrict' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('categories_slug_uq').on(t.slug), index('categories_parent_idx').on(t.parentId)],
);

export const products = pgTable(
  'products',
  {
    id: id(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    brand: text('brand').notNull(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    material: text('material'),
    sustainabilityInfo: text('sustainability_info'),
    careInstructions: text('care_instructions'),
    subscriptionEligible: boolean('subscription_eligible').notNull().default(true),
    oneTimeEligible: boolean('one_time_eligible').notNull().default(true),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex('products_slug_uq').on(t.slug),
    index('products_category_idx').on(t.categoryId),
    index('products_active_idx')
      .on(t.isActive)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
);

/** The purchasable unit: one product in one size and colour, with its own SKU and price. */
export const productVariants = pgTable(
  'product_variants',
  {
    id: id(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    sku: text('sku').notNull(),
    sizeCode: text('size_code')
      .notNull()
      .references(() => sizes.code, { onDelete: 'restrict' }),
    color: text('color').notNull(),
    priceAmount: amount('price_amount').notNull(),
    currency: currency(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('product_variants_sku_uq').on(t.sku),
    uniqueIndex('product_variants_product_size_color_uq').on(t.productId, t.sizeCode, t.color),
    index('product_variants_size_idx').on(t.sizeCode),
    index('product_variants_price_idx').on(t.priceAmount),
    check('product_variants_price_non_negative', sql`${t.priceAmount} >= 0`),
  ],
);

/** A reference to an object in external storage. Image bytes are never stored in PostgreSQL. */
export const mediaAssets = pgTable(
  'media_assets',
  {
    id: id(),
    storageProvider: text('storage_provider').notNull(),
    objectKey: text('object_key').notNull(),
    contentType: text('content_type').notNull(),
    byteSize: integer('byte_size').notNull(),
    purpose: mediaPurpose('purpose').notNull(),
    uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('media_assets_provider_key_uq').on(t.storageProvider, t.objectKey)],
);

export const productImages = pgTable(
  'product_images',
  {
    id: id(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    mediaAssetId: uuid('media_asset_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'restrict' }),
    altText: text('alt_text').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('product_images_product_idx').on(t.productId, t.sortOrder)],
);

/**
 * Sellable stock of brand-new units per variant and location. Physical units that
 * circulate between customers are tracked one by one in `garments` instead.
 */
export const inventoryItems = pgTable(
  'inventory_items',
  {
    id: id(),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),
    locationCode: text('location_code').notNull(),
    quantityOnHand: integer('quantity_on_hand').notNull().default(0),
    quantityReserved: integer('quantity_reserved').notNull().default(0),
    reorderThreshold: integer('reorder_threshold').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('inventory_items_variant_location_uq').on(t.variantId, t.locationCode),
    check(
      'inventory_items_quantities_valid',
      sql`${t.quantityOnHand} >= 0 AND ${t.quantityReserved} >= 0 AND ${t.quantityReserved} <= ${t.quantityOnHand}`,
    ),
  ],
);

/** Append-only ledger explaining every change to an inventory item's counters. */
export const inventoryMovements = pgTable(
  'inventory_movements',
  {
    id: id(),
    inventoryItemId: uuid('inventory_item_id')
      .notNull()
      .references(() => inventoryItems.id, { onDelete: 'restrict' }),
    reason: inventoryMovementReason('reason').notNull(),
    onHandDelta: integer('on_hand_delta').notNull().default(0),
    reservedDelta: integer('reserved_delta').notNull().default(0),
    referenceType: text('reference_type'),
    referenceId: uuid('reference_id'),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'restrict' }),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [
    index('inventory_movements_item_idx').on(t.inventoryItemId, t.createdAt),
    index('inventory_movements_reference_idx').on(t.referenceType, t.referenceId),
  ],
);
