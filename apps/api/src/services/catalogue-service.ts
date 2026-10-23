import { type Database, schema } from '@bambino/database';
import { type SQL, and, asc, desc, eq, ilike, inArray, isNull, or, sql } from '@bambino/database/orm';
import { z } from 'zod';
import { firstFreeSlug, slugify } from '../domain/slugs';
import { recordAudit } from './audit-service';
import { type ServiceContext, requirePermission } from './context';
import { AppError, isUniqueViolation, parseInput } from './errors';
import { type Page, type PageRequest, decodeOffset, encodeOffset, pageSize } from './pagination';

export type ProductRow = typeof schema.products.$inferSelect;
export type VariantRow = typeof schema.productVariants.$inferSelect;
export type CategoryRow = typeof schema.categories.$inferSelect;
export type SizeRow = typeof schema.sizes.$inferSelect;
export type DeliveryOptionRow = typeof schema.deliveryOptions.$inferSelect;

export type ProductSort = 'NEWEST' | 'PRICE_ASC' | 'PRICE_DESC' | 'NAME_ASC';

export interface ProductFilter {
  search?: string | null;
  categorySlug?: string | null;
  sizeCodes?: readonly string[] | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  inStockOnly?: boolean | null;
  subscriptionEligible?: boolean | null;
  oneTimeEligible?: boolean | null;
}

const MAX_CATALOGUE_PAGE = 48;
const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'validation.slug.invalid')
  .max(120);

const categorySchema = z.object({
  id: z.uuid().nullish(),
  parentId: z.uuid().nullish(),
  slug,
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullish(),
  sortOrder: z.number().int().min(0).max(10_000).nullish(),
  isActive: z.boolean().nullish(),
});

const productSchema = z.object({
  /** Optional: when left out, a new product's address is made from its name and an edit keeps the old one. */
  slug: slug.nullish(),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(5_000),
  brand: z.string().trim().min(1).max(80),
  categoryId: z.uuid(),
  material: z.string().trim().max(200).nullish(),
  sustainabilityInfo: z.string().trim().max(2_000).nullish(),
  careInstructions: z.string().trim().max(2_000).nullish(),
  subscriptionEligible: z.boolean(),
  oneTimeEligible: z.boolean(),
  isActive: z.boolean(),
});

const variantSchema = z.object({
  id: z.uuid().nullish(),
  productId: z.uuid(),
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{3,40}$/, 'validation.sku.invalid'),
  sizeCode: z.string().trim().min(1).max(20),
  color: z.string().trim().min(1).max(40),
  priceAmount: z.number().int().min(0).max(100_000_000),
  isActive: z.boolean().nullish(),
});

/** Products, variants, categories, sizes and delivery options: public reads plus staff edits. */
export class CatalogueService {
  constructor(
    private readonly db: Database,
    private readonly currency: string,
    private readonly marketCode: string,
  ) {}

  /** Public listing: active products with at least one active variant. Staff listing includes everything. */
  async listProducts(
    filter: ProductFilter,
    sort: ProductSort,
    request: PageRequest,
    options: { includeInactive?: boolean } = {},
  ): Promise<Page<ProductRow> & { totalCount: number }> {
    const size = Math.min(pageSize(request, 24), MAX_CATALOGUE_PAGE);
    const offset = decodeOffset(request.after);
    const where = await this.productConditions(filter, options.includeInactive ?? false);

    const minPrice = sql<number>`(select min(v.price_amount) from product_variants v where v.product_id = ${schema.products.id} and v.is_active)`;
    const order =
      sort === 'PRICE_ASC'
        ? [asc(minPrice), asc(schema.products.id)]
        : sort === 'PRICE_DESC'
          ? [desc(minPrice), asc(schema.products.id)]
          : sort === 'NAME_ASC'
            ? [asc(schema.products.name), asc(schema.products.id)]
            : [desc(schema.products.createdAt), asc(schema.products.id)];

    const rows = await this.db
      .select()
      .from(schema.products)
      .where(where)
      .orderBy(...order)
      .limit(size + 1)
      .offset(offset);
    const [count] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.products)
      .where(where);
    const items = rows.slice(0, size);
    return {
      items,
      hasNextPage: rows.length > size,
      endCursor: items.length > 0 ? encodeOffset(offset + items.length) : null,
      totalCount: count?.n ?? 0,
    };
  }

  async getProductBySlug(productSlug: string): Promise<ProductRow | null> {
    const [product] = await this.db
      .select()
      .from(schema.products)
      .where(
        and(
          eq(schema.products.slug, productSlug.toLowerCase()),
          eq(schema.products.isActive, true),
          isNull(schema.products.deletedAt),
        ),
      );
    return product ?? null;
  }

  async listCategories(): Promise<CategoryRow[]> {
    return this.db
      .select()
      .from(schema.categories)
      .where(eq(schema.categories.isActive, true))
      .orderBy(asc(schema.categories.sortOrder), asc(schema.categories.name));
  }

  async listSizes(): Promise<SizeRow[]> {
    return this.db
      .select()
      .from(schema.sizes)
      .where(eq(schema.sizes.isActive, true))
      .orderBy(asc(schema.sizes.sortOrder));
  }

  async listDeliveryOptions(): Promise<DeliveryOptionRow[]> {
    return this.db
      .select()
      .from(schema.deliveryOptions)
      .where(
        and(
          eq(schema.deliveryOptions.marketCode, this.marketCode),
          eq(schema.deliveryOptions.isActive, true),
        ),
      )
      .orderBy(asc(schema.deliveryOptions.feeAmount));
  }

  // --- batch reads for GraphQL loaders -----------------------------------------

  async productsByIds(ids: readonly string[]): Promise<ProductRow[]> {
    return ids.length
      ? this.db
          .select()
          .from(schema.products)
          .where(inArray(schema.products.id, [...ids]))
      : [];
  }

  async variantsByIds(ids: readonly string[]): Promise<VariantRow[]> {
    return ids.length
      ? this.db
          .select()
          .from(schema.productVariants)
          .where(inArray(schema.productVariants.id, [...ids]))
      : [];
  }

  /** Active variants only, ordered by size. */
  async activeVariantsForProducts(productIds: readonly string[]): Promise<VariantRow[]> {
    if (productIds.length === 0) return [];
    return this.db
      .select({ variant: schema.productVariants })
      .from(schema.productVariants)
      .innerJoin(schema.sizes, eq(schema.sizes.code, schema.productVariants.sizeCode))
      .where(
        and(
          inArray(schema.productVariants.productId, [...productIds]),
          eq(schema.productVariants.isActive, true),
        ),
      )
      .orderBy(asc(schema.sizes.sortOrder), asc(schema.productVariants.color))
      .then((rows) => rows.map((row) => row.variant));
  }

  async categoriesByIds(ids: readonly string[]): Promise<CategoryRow[]> {
    return ids.length
      ? this.db
          .select()
          .from(schema.categories)
          .where(inArray(schema.categories.id, [...ids]))
      : [];
  }

  async childCategories(parentIds: readonly string[]): Promise<CategoryRow[]> {
    if (parentIds.length === 0) return [];
    return this.db
      .select()
      .from(schema.categories)
      .where(and(inArray(schema.categories.parentId, [...parentIds]), eq(schema.categories.isActive, true)))
      .orderBy(asc(schema.categories.sortOrder));
  }

  async sizesByCodes(codes: readonly string[]): Promise<SizeRow[]> {
    return codes.length
      ? this.db
          .select()
          .from(schema.sizes)
          .where(inArray(schema.sizes.code, [...codes]))
      : [];
  }

  async imagesForProducts(productIds: readonly string[]) {
    if (productIds.length === 0) return [];
    return this.db
      .select({ image: schema.productImages, objectKey: schema.mediaAssets.objectKey })
      .from(schema.productImages)
      .innerJoin(schema.mediaAssets, eq(schema.mediaAssets.id, schema.productImages.mediaAssetId))
      .where(inArray(schema.productImages.productId, [...productIds]))
      .orderBy(asc(schema.productImages.sortOrder));
  }

  async deliveryOptionsByCodes(codes: readonly string[]): Promise<DeliveryOptionRow[]> {
    if (codes.length === 0) return [];
    return this.db
      .select()
      .from(schema.deliveryOptions)
      .where(
        and(
          inArray(schema.deliveryOptions.code, [...codes]),
          eq(schema.deliveryOptions.marketCode, this.marketCode),
        ),
      );
  }

  // --- staff ------------------------------------------------------------------

  async upsertCategory(context: ServiceContext, rawInput: unknown): Promise<CategoryRow> {
    requirePermission(context, 'product:write');
    const input = parseInput(categorySchema, rawInput);
    const values = {
      parentId: input.parentId ?? null,
      slug: input.slug,
      name: input.name,
      description: input.description ?? null,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
    };
    if (input.parentId && input.parentId === input.id) {
      throw new AppError('VALIDATION_FAILED', 'A category cannot be its own parent.', 'CATEGORY_CYCLE');
    }
    return this.uniqueSlug(async () => {
      const [row] = input.id
        ? await this.db
            .update(schema.categories)
            .set(values)
            .where(eq(schema.categories.id, input.id))
            .returning()
        : await this.db.insert(schema.categories).values(values).returning();
      if (!row) throw new AppError('NOT_FOUND', 'Category not found.');
      return row;
    });
  }

  async createProduct(context: ServiceContext, rawInput: unknown): Promise<ProductRow> {
    requirePermission(context, 'product:write');
    const { slug: chosen, ...rest } = parseInput(productSchema, rawInput);
    const insert = (address: string) =>
      this.db.transaction(async (tx) => {
        const values = { ...rest, slug: address };
        const [row] = await tx.insert(schema.products).values(values).returning();
        if (!row) throw new Error('Product insert returned no row');
        await recordAudit(tx, context, {
          action: 'product.created',
          entityType: 'product',
          entityId: row.id,
          newValue: values,
        });
        return row;
      });
    if (chosen) return this.uniqueSlug(() => insert(chosen));

    // No address given: build one from the name, numbering it if taken. Two products created at the same moment can
    // pick the same one, so a clash is retried with a fresh look at what is taken.
    const base = slugify(rest.name);
    for (let attempt = 0; ; attempt++) {
      const taken = await this.db
        .select({ slug: schema.products.slug })
        .from(schema.products)
        .where(or(eq(schema.products.slug, base), ilike(schema.products.slug, `${base}-%`)));
      try {
        return await insert(firstFreeSlug(base, new Set(taken.map((row) => row.slug))));
      } catch (error) {
        if (!isUniqueViolation(error, 'products_slug_uq') || attempt >= 4) throw error;
      }
    }
  }

  async updateProduct(context: ServiceContext, id: string, rawInput: unknown): Promise<ProductRow> {
    requirePermission(context, 'product:write');
    const productId = parseInput(z.uuid(), id);
    const { slug: chosen, ...rest } = parseInput(productSchema, rawInput);
    // Leaving the address out keeps the current one, so a customer's saved link keeps working.
    const input = chosen ? { ...rest, slug: chosen } : rest;
    return this.uniqueSlug(() =>
      this.db.transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(schema.products)
          .where(eq(schema.products.id, productId))
          .for('update');
        if (!before) throw new AppError('NOT_FOUND', 'Product not found.');
        const [row] = await tx
          .update(schema.products)
          .set(input)
          .where(eq(schema.products.id, productId))
          .returning();
        if (!row) throw new AppError('NOT_FOUND', 'Product not found.');
        await recordAudit(tx, context, {
          action: 'product.updated',
          entityType: 'product',
          entityId: productId,
          previousValue: pick(before, Object.keys(input)),
          newValue: input,
        });
        return row;
      }),
    );
  }

  /** Price changes land in the audit log with the old and new amounts. */
  async upsertVariant(context: ServiceContext, rawInput: unknown): Promise<VariantRow> {
    requirePermission(context, 'product:write');
    const input = parseInput(variantSchema, rawInput);
    try {
      return await this.db.transaction(async (tx) => {
        const [product] = await tx
          .select({ id: schema.products.id })
          .from(schema.products)
          .where(eq(schema.products.id, input.productId));
        if (!product) throw new AppError('NOT_FOUND', 'Product not found.');
        const [size] = await tx
          .select({ code: schema.sizes.code })
          .from(schema.sizes)
          .where(eq(schema.sizes.code, input.sizeCode));
        if (!size) throw new AppError('VALIDATION_FAILED', 'Unknown size.', 'UNKNOWN_SIZE');
        const values = {
          productId: input.productId,
          sku: input.sku,
          sizeCode: input.sizeCode,
          color: input.color,
          priceAmount: input.priceAmount,
          currency: this.currency,
          isActive: input.isActive ?? true,
        };

        if (!input.id) {
          const [row] = await tx.insert(schema.productVariants).values(values).returning();
          if (!row) throw new Error('Variant insert returned no row');
          await tx
            .insert(schema.inventoryItems)
            .values({ variantId: row.id, locationCode: 'KGL-MAIN' })
            .onConflictDoNothing();
          await recordAudit(tx, context, {
            action: 'variant.created',
            entityType: 'product_variant',
            entityId: row.id,
            newValue: values,
          });
          return row;
        }

        const [before] = await tx
          .select()
          .from(schema.productVariants)
          .where(eq(schema.productVariants.id, input.id))
          .for('update');
        if (!before || before.productId !== input.productId)
          throw new AppError('NOT_FOUND', 'Variant not found.');
        const [row] = await tx
          .update(schema.productVariants)
          .set(values)
          .where(eq(schema.productVariants.id, input.id))
          .returning();
        if (!row) throw new AppError('NOT_FOUND', 'Variant not found.');
        if (before.priceAmount !== row.priceAmount) {
          await recordAudit(tx, context, {
            action: 'variant.price_changed',
            entityType: 'product_variant',
            entityId: row.id,
            previousValue: { priceAmount: before.priceAmount, currency: before.currency },
            newValue: { priceAmount: row.priceAmount, currency: row.currency },
          });
        }
        return row;
      });
    } catch (error) {
      if (isUniqueViolation(error, 'product_variants_sku_uq'))
        throw new AppError('CONFLICT', 'This SKU is already used.', 'SKU_IN_USE');
      if (isUniqueViolation(error, 'product_variants_product_size_color_uq')) {
        throw new AppError(
          'CONFLICT',
          'This product already has a variant in that size and colour.',
          'VARIANT_EXISTS',
        );
      }
      throw error;
    }
  }

  private async productConditions(filter: ProductFilter, includeInactive: boolean): Promise<SQL | undefined> {
    const conditions: (SQL | undefined)[] = [isNull(schema.products.deletedAt)];
    const variantMatches: SQL[] = [sql`v.product_id = ${schema.products.id}`];
    if (!includeInactive) {
      conditions.push(eq(schema.products.isActive, true));
      variantMatches.push(sql`v.is_active`);
    }

    if (filter.search?.trim()) {
      const term = `%${filter.search.trim().replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
      conditions.push(or(ilike(schema.products.name, term), ilike(schema.products.description, term)));
    }
    if (filter.categorySlug) {
      const [category] = await this.db
        .select({ id: schema.categories.id })
        .from(schema.categories)
        .where(eq(schema.categories.slug, filter.categorySlug.toLowerCase()));
      if (!category) return sql`false`;
      const children = await this.db
        .select({ id: schema.categories.id })
        .from(schema.categories)
        .where(eq(schema.categories.parentId, category.id));
      conditions.push(
        inArray(schema.products.categoryId, [category.id, ...children.map((child) => child.id)]),
      );
    }
    if (filter.subscriptionEligible != null)
      conditions.push(eq(schema.products.subscriptionEligible, filter.subscriptionEligible));
    if (filter.oneTimeEligible != null)
      conditions.push(eq(schema.products.oneTimeEligible, filter.oneTimeEligible));

    if (filter.sizeCodes?.length) {
      variantMatches.push(
        sql`v.size_code in (${sql.join(
          filter.sizeCodes.map((code) => sql`${code}`),
          sql`, `,
        )})`,
      );
    }
    if (filter.minPrice != null) variantMatches.push(sql`v.price_amount >= ${filter.minPrice}`);
    if (filter.maxPrice != null) variantMatches.push(sql`v.price_amount <= ${filter.maxPrice}`);
    if (filter.inStockOnly) {
      variantMatches.push(
        sql`exists (select 1 from inventory_items i where i.variant_id = v.id and i.quantity_on_hand - i.quantity_reserved > 0)`,
      );
    }
    // Every filter on variants must hold for the same variant (e.g. "size 6-9M and in stock").
    conditions.push(
      sql`exists (select 1 from product_variants v where ${sql.join(variantMatches, sql` and `)})`,
    );
    return and(...conditions);
  }

  private async uniqueSlug<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (isUniqueViolation(error, 'products_slug_uq') || isUniqueViolation(error, 'categories_slug_uq')) {
        throw new AppError('CONFLICT', 'This slug is already used.', 'SLUG_IN_USE');
      }
      throw error;
    }
  }
}

function pick(row: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((key) => [key, row[key]]));
}
