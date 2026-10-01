import { type Database, type Executor, schema } from '@bambino/database';
import { and, asc, eq, isNull } from '@bambino/database/orm';
import { type CurrencyCode, type Money, money, multiply, sum } from '@bambino/utils';
import { z } from 'zod';
import { type ServiceContext, requireUser } from './context';
import { AppError, parseInput } from './errors';
import type { InventoryService } from './inventory-service';

export const MAX_LINE_QUANTITY = 20;
export const MAX_CART_LINES = 50;

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
