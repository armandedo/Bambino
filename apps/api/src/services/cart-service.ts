import { BAG_POLICY } from '@bambino/config';
import { type Database, type Executor, schema } from '@bambino/database';
import { and, asc, eq, inArray, isNull } from '@bambino/database/orm';
import type { BagAdjustmentReason } from '@bambino/types';
import { type CurrencyCode, type Money, money, multiply, sum } from '@bambino/utils';
import { z } from 'zod';
import { type ServiceContext, requireUser } from './context';
import { AppError, parseInput } from './errors';
import type { InventoryService } from './inventory-service';

export const MAX_LINE_QUANTITY = BAG_POLICY.maxQuantityPerItem;
export const MAX_CART_LINES = BAG_POLICY.maxLines;

export interface CartLine {
  id: string;
  variantId: string;
  productId: string;
  quantity: number;
  unitPrice: Money;
  lineTotal: Money;
}

export interface CartView {
  id: string;
  items: CartLine[];
  subtotal: Money;
  itemCount: number;
}

const quantitySchema = z.number().int().min(1).max(MAX_LINE_QUANTITY);

/** What a device sends for a guest bag: which pieces and how many. Never a price, a name or a person. */
const bagItemsSchema = z
  .array(z.object({ variantId: z.uuid(), quantity: z.number().int().min(1).max(999) }))
  .max(MAX_CART_LINES);
const mergeSchema = z.object({ mergeKey: z.string().trim().min(8).max(100), items: bagItemsSchema });

/** A bag line that is not what was asked for, with the quantity the bag ends up holding (0 when left out). */
export interface BagAdjustment {
  variantId: string;
  productName: string | null;
  requested: number;
  quantity: number;
  reason: BagAdjustmentReason;
}

export interface GuestBagView {
  bag: CartView;
  adjustments: BagAdjustment[];
}

export interface GuestBagMergeResult {
  cart: CartView;
  adjustments: BagAdjustment[];
  alreadyMerged: boolean;
}

/** One line per variant, quantities added up, in the order first seen. */
function combine(
  items: { variantId: string; quantity: number }[],
): { variantId: string; quantity: number }[] {
  const byVariant = new Map<string, number>();
  for (const item of items)
    byVariant.set(item.variantId, (byVariant.get(item.variantId) ?? 0) + item.quantity);
  return [...byVariant].map(([variantId, quantity]) => ({ variantId, quantity }));
}

/**
 * The cart stores only variant and quantity. Prices are read fresh from the catalogue on
 * every view, so a price change is reflected immediately and nothing client-side is trusted.
 */
export class CartService {
  constructor(
    private readonly db: Database,
    private readonly inventory: InventoryService,
    private readonly currency: CurrencyCode,
  ) {}

  async getCart(context: ServiceContext): Promise<CartView | null> {
    const actor = requireUser(context);
    const cart = await this.findActiveCart(this.db, actor.userId);
    return cart ? this.view(this.db, cart.id) : null;
  }

  async createCart(context: ServiceContext): Promise<CartView> {
    const actor = requireUser(context);
    const cartId = await this.ensureCart(this.db, actor.userId);
    return this.view(this.db, cartId);
  }

  async addToCart(context: ServiceContext, rawVariantId: unknown, rawQuantity: unknown): Promise<CartView> {
    const actor = requireUser(context);
    const variantId = parseInput(z.uuid(), rawVariantId);
    const quantity = parseInput(quantitySchema, rawQuantity ?? 1);
    return this.db.transaction(async (tx) => {
      await this.assertPurchasable(tx, variantId);
      const cartId = await this.ensureCart(tx, actor.userId);
      const [existing] = await tx
        .select()
        .from(schema.cartItems)
        .where(and(eq(schema.cartItems.cartId, cartId), eq(schema.cartItems.variantId, variantId)))
        .for('update');
      const nextQuantity = (existing?.quantity ?? 0) + quantity;
      if (nextQuantity > MAX_LINE_QUANTITY) {
        throw new AppError(
          'VALIDATION_FAILED',
          `At most ${MAX_LINE_QUANTITY} of one item per order.`,
          'QUANTITY_LIMIT',
        );
      }
      await this.assertAvailable(tx, variantId, nextQuantity);
      if (existing) {
        await tx
          .update(schema.cartItems)
          .set({ quantity: nextQuantity })
          .where(eq(schema.cartItems.id, existing.id));
      } else {
        const lines = await tx
          .select({ id: schema.cartItems.id })
          .from(schema.cartItems)
          .where(eq(schema.cartItems.cartId, cartId));
        if (lines.length >= MAX_CART_LINES)
          throw new AppError('VALIDATION_FAILED', 'The cart is full.', 'CART_FULL');
        await tx.insert(schema.cartItems).values({ cartId, variantId, quantity });
      }
      return this.view(tx, cartId);
    });
  }

  async updateCartItem(context: ServiceContext, rawItemId: unknown, rawQuantity: unknown): Promise<CartView> {
    const actor = requireUser(context);
    const itemId = parseInput(z.uuid(), rawItemId);
    const quantity = parseInput(quantitySchema, rawQuantity);
    return this.db.transaction(async (tx) => {
      const item = await this.findOwnItem(tx, actor.userId, itemId);
      await this.assertAvailable(tx, item.variantId, quantity);
      await tx.update(schema.cartItems).set({ quantity }).where(eq(schema.cartItems.id, itemId));
      return this.view(tx, item.cartId);
    });
  }

  async removeFromCart(context: ServiceContext, rawItemId: unknown): Promise<CartView> {
    const actor = requireUser(context);
    const itemId = parseInput(z.uuid(), rawItemId);
    return this.db.transaction(async (tx) => {
      const item = await this.findOwnItem(tx, actor.userId, itemId);
      await tx.delete(schema.cartItems).where(eq(schema.cartItems.id, itemId));
      return this.view(tx, item.cartId);
    });
  }

  /**
   * A visitor's bag as it stands right now: names, photos and prices come from the catalogue, never from the
   * device. Pieces that are no longer sold are left out; quantities are brought within the per-order limit and
   * what is in stock. Nothing is saved and no stock is held: this is a read.
   */
  async previewGuestBag(rawItems: unknown): Promise<GuestBagView> {
    const items = combine(parseInput(bagItemsSchema, rawItems));
    const known = await this.sellable(
      this.db,
      items.map((item) => item.variantId),
    );
    const stock = await this.inventory.availability(this.db, [...known.keys()]);
    const adjustments: BagAdjustment[] = [];
    const lines: CartLine[] = [];
    for (const item of items) {
      const variant = known.get(item.variantId);
      if (!variant?.sellable) {
        adjustments.push({
          variantId: item.variantId,
          productName: variant?.productName || null,
          requested: item.quantity,
          quantity: 0,
          reason: 'UNAVAILABLE',
        });
        continue;
      }
      const available = Math.max(stock.get(item.variantId) ?? 0, 0);
      let quantity = item.quantity;
      let reason: BagAdjustmentReason | null = null;
      if (quantity > MAX_LINE_QUANTITY) {
        quantity = MAX_LINE_QUANTITY;
        reason = 'QUANTITY_LIMIT';
      }
      if (available === 0) {
        // Kept in the bag so the shopper sees it is gone and removes it, exactly as in a signed-in cart.
        reason = 'OUT_OF_STOCK';
      } else if (quantity > available) {
        quantity = available;
        reason = 'LIMITED_STOCK';
      }
      if (reason) {
        adjustments.push({
          variantId: item.variantId,
          productName: variant.productName || null,
          requested: item.quantity,
          quantity: reason === 'OUT_OF_STOCK' ? 0 : quantity,
          reason,
        });
      }
      const unitPrice = money(variant.priceAmount, this.currency);
      lines.push({
        id: item.variantId,
        variantId: item.variantId,
        productId: variant.productId,
        quantity,
        unitPrice,
        lineTotal: multiply(unitPrice, quantity),
      });
    }
    return {
      bag: {
        id: 'guest',
        items: lines,
        subtotal: sum(
          lines.map((line) => line.lineTotal),
          this.currency,
        ),
        itemCount: lines.reduce((count, line) => count + line.quantity, 0),
      },
      adjustments,
    };
  }

  /**
   * Adds a guest bag to the signed-in customer's cart, once. The merge key is recorded first, in the same
   * transaction: sending the same bag again changes nothing and says so. Matching pieces are added together, up to
   * the per-order limit and what is in stock; whatever could not be added in full is reported.
   */
  async mergeGuestBag(context: ServiceContext, rawInput: unknown): Promise<GuestBagMergeResult> {
    const actor = requireUser(context);
    const input = parseInput(mergeSchema, rawInput);
    const items = combine(input.items);
    return this.db.transaction(async (tx) => {
      const cartId = await this.ensureCart(tx, actor.userId);
      const [recorded] = await tx
        .insert(schema.guestBagMerges)
        .values({ userId: actor.userId, mergeKey: input.mergeKey })
        .onConflictDoNothing()
        .returning({ id: schema.guestBagMerges.id });
      if (!recorded) return { cart: await this.view(tx, cartId), adjustments: [], alreadyMerged: true };

      const existing = await tx
        .select()
        .from(schema.cartItems)
        .where(eq(schema.cartItems.cartId, cartId))
        .for('update');
      const inCart = new Map(existing.map((line) => [line.variantId, line]));
      let lineCount = existing.length;
      const known = await this.sellable(
        tx,
        items.map((item) => item.variantId),
      );
      const stock = await this.inventory.availability(tx, [...known.keys()]);
      const adjustments: BagAdjustment[] = [];
      for (const item of items) {
        const variant = known.get(item.variantId);
        const line = inCart.get(item.variantId);
        const had = line?.quantity ?? 0;
        const report = (reason: BagAdjustmentReason, quantity: number) =>
          adjustments.push({
            variantId: item.variantId,
            productName: variant?.productName || null,
            requested: item.quantity,
            quantity,
            reason,
          });
        if (!variant?.sellable) {
          report('UNAVAILABLE', had);
          continue;
        }
        const available = Math.max(stock.get(item.variantId) ?? 0, 0);
        const wanted = had + item.quantity;
        const target = Math.min(wanted, MAX_LINE_QUANTITY, available);
        if (target <= had) {
          // Nothing more can be added. What the cart already held stays as it was.
          report(
            available <= had ? (available === 0 ? 'OUT_OF_STOCK' : 'LIMITED_STOCK') : 'QUANTITY_LIMIT',
            had,
          );
          continue;
        }
        if (!line && lineCount >= MAX_CART_LINES) {
          report('BAG_FULL', 0);
          continue;
        }
        if (line) {
          await tx.update(schema.cartItems).set({ quantity: target }).where(eq(schema.cartItems.id, line.id));
        } else {
          await tx.insert(schema.cartItems).values({ cartId, variantId: item.variantId, quantity: target });
          lineCount += 1;
        }
        if (target < wanted)
          report(
            available < Math.min(wanted, MAX_LINE_QUANTITY) ? 'LIMITED_STOCK' : 'QUANTITY_LIMIT',
            target,
          );
      }
      return { cart: await this.view(tx, cartId), adjustments, alreadyMerged: false };
    });
  }

  /** What is known about these variants, and whether each may be sold here (the rule of `assertPurchasable`). */
  private async sellable(db: Executor, variantIds: string[]) {
    const found = new Map<
      string,
      { sellable: boolean; productId: string; productName: string; priceAmount: number }
    >();
    if (variantIds.length === 0) return found;
    const rows = await db
      .select({ variant: schema.productVariants, product: schema.products })
      .from(schema.productVariants)
      .innerJoin(schema.products, eq(schema.products.id, schema.productVariants.productId))
      .where(inArray(schema.productVariants.id, variantIds));
    for (const { variant, product } of rows) {
      found.set(variant.id, {
        sellable:
          product.deletedAt === null &&
          variant.isActive &&
          product.isActive &&
          product.oneTimeEligible &&
          variant.currency.trim() === this.currency,
        productId: product.id,
        // A removed or hidden product is not named to someone who can no longer see it.
        productName: product.deletedAt === null && product.isActive ? product.name : '',
        priceAmount: variant.priceAmount,
      });
    }
    return found;
  }

  async findActiveCart(db: Executor, userId: string) {
    const [cart] = await db
      .select()
      .from(schema.carts)
      .where(and(eq(schema.carts.userId, userId), eq(schema.carts.status, 'ACTIVE')));
    return cart ?? null;
  }

  /** Lines with current catalogue prices, used by both the cart view and checkout. */
  async lines(db: Executor, cartId: string): Promise<CartLine[]> {
    const rows = await db
      .select({ item: schema.cartItems, variant: schema.productVariants })
      .from(schema.cartItems)
      .innerJoin(schema.productVariants, eq(schema.productVariants.id, schema.cartItems.variantId))
      .where(eq(schema.cartItems.cartId, cartId))
      .orderBy(asc(schema.cartItems.createdAt));
    return rows.map(({ item, variant }) => {
      const unitPrice = money(variant.priceAmount, this.currency);
      return {
        id: item.id,
        variantId: variant.id,
        productId: variant.productId,
        quantity: item.quantity,
        unitPrice,
        lineTotal: multiply(unitPrice, item.quantity),
      };
    });
  }

  private async view(db: Executor, cartId: string): Promise<CartView> {
    const items = await this.lines(db, cartId);
    return {
      id: cartId,
      items,
      subtotal: sum(
        items.map((line) => line.lineTotal),
        this.currency,
      ),
      itemCount: items.reduce((count, line) => count + line.quantity, 0),
    };
  }

  private async ensureCart(db: Executor, userId: string): Promise<string> {
    const existing = await this.findActiveCart(db, userId);
    if (existing) return existing.id;
    await db.insert(schema.carts).values({ userId, currency: this.currency }).onConflictDoNothing();
    const created = await this.findActiveCart(db, userId);
    if (!created) throw new Error('Cart creation failed');
    return created.id;
  }

  private async findOwnItem(db: Executor, userId: string, itemId: string) {
    const [row] = await db
      .select({ item: schema.cartItems })
      .from(schema.cartItems)
      .innerJoin(schema.carts, eq(schema.carts.id, schema.cartItems.cartId))
      .where(
        and(
          eq(schema.cartItems.id, itemId),
          eq(schema.carts.userId, userId),
          eq(schema.carts.status, 'ACTIVE'),
        ),
      );
    if (!row) throw new AppError('NOT_FOUND', 'Cart item not found.');
    return row.item;
  }

  /** Active product and variant, sold individually, priced in this market's currency. */
  async assertPurchasable(db: Executor, variantId: string): Promise<void> {
    const [row] = await db
      .select({ variant: schema.productVariants, product: schema.products })
      .from(schema.productVariants)
      .innerJoin(schema.products, eq(schema.products.id, schema.productVariants.productId))
      .where(and(eq(schema.productVariants.id, variantId), isNull(schema.products.deletedAt)));
    if (!row || !row.variant.isActive || !row.product.isActive)
      throw new AppError('NOT_FOUND', 'This item is not available.');
    if (!row.product.oneTimeEligible) {
      throw new AppError(
        'VALIDATION_FAILED',
        'This item is only available on a subscription.',
        'SUBSCRIPTION_ONLY',
      );
    }
    if (row.variant.currency.trim() !== this.currency) {
      throw new AppError('VALIDATION_FAILED', 'This item is not sold in this market.', 'WRONG_MARKET');
    }
  }

  private async assertAvailable(db: Executor, variantId: string, quantity: number): Promise<void> {
    const available = (await this.inventory.availability(db, [variantId])).get(variantId) ?? 0;
    if (available < quantity) {
      throw new AppError('CONFLICT', `Only ${Math.max(available, 0)} left in stock.`, 'OUT_OF_STOCK');
    }
  }
}
