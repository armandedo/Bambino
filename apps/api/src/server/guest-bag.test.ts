import { randomUUID } from 'node:crypto';
import { schema } from '@bambino/database';
import { eq } from '@bambino/database/orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type TestApp, createTestApp, errorCode } from '../testing/test-app';

/**
 * A visitor's bag lives on their device as variant ids and quantities. The server prices and checks it on every
 * read, and adds it to the customer's cart once when they sign in.
 */
let t: TestApp;

beforeAll(async () => {
  t = await createTestApp({ catalogue: true });
}, 240_000);

afterAll(async () => {
  await t.close();
});

const BAG = `query ($items: [BagItemInput!]!) { guestBag(items: $items) {
  bag { id itemCount subtotal { amount currency }
    items { id quantity lineTotal { amount } variant { id inStock price { amount } } product { name slug } } }
  adjustments { variantId productName requested quantity reason } } }`;
const MERGE = `mutation ($input: MergeGuestBagInput!) { mergeGuestBag(input: $input) { alreadyMerged
  cart { itemCount subtotal { amount } items { quantity variant { id } } }
  adjustments { variantId productName requested quantity reason } } }`;
const CART = '{ myCart { itemCount items { quantity variant { id } } } }';

interface Bag {
  bag: {
    id: string;
    itemCount: number;
    subtotal: { amount: number; currency: string };
    items: {
      id: string;
      quantity: number;
      lineTotal: { amount: number };
      variant: { id: string; inStock: boolean; price: { amount: number } };
      product: { name: string; slug: string };
    }[];
  };
  adjustments: {
    variantId: string;
    productName: string | null;
    requested: number;
    quantity: number;
    reason: string;
  }[];
}
interface Merge {
  alreadyMerged: boolean;
  cart: {
    itemCount: number;
    subtotal: { amount: number };
    items: { quantity: number; variant: { id: string } }[];
  };
  adjustments: Bag['adjustments'];
}

let pool: { id: string; price: number; productName: string }[] | null = null;
/** A sellable variant no other test in this file uses (each from a different product), with its price and name. */
async function variant() {
  if (!pool) {
    const { products } = (
      await t.gql(
        '{ products(filter: { oneTimeEligible: true }, first: 50) { edges { node { name variants { id price { amount } } } } } }',
      )
    ).data as {
      products: {
        edges: { node: { name: string; variants: { id: string; price: { amount: number } }[] } }[];
      };
    };
    pool = products.edges.flatMap(({ node }) =>
      node.variants.map((entry) => ({ id: entry.id, price: entry.price.amount, productName: node.name })),
    );
  }
  const next = pool.shift();
  if (!next) throw new Error('the seed catalogue has no more unused products');
  return next;
}

async function setStock(variantId: string, onHand: number) {
  await t.db
    .update(schema.inventoryItems)
    .set({ quantityOnHand: onHand, quantityReserved: 0 })
    .where(eq(schema.inventoryItems.variantId, variantId));
}

const guestBag = async (items: { variantId: string; quantity: number }[]) =>
  (await t.gql(BAG, { items })).data?.guestBag as Bag;

async function merge(token: string, mergeKey: string, items: { variantId: string; quantity: number }[]) {
  const response = await t.gql(MERGE, { input: { mergeKey, items } }, { token });
  if (response.errors) throw new Error(JSON.stringify(response.errors));
  return response.data?.mergeGuestBag as Merge;
}

const cartOf = async (token: string) =>
  ((await t.gql(CART, {}, { token })).data?.myCart as Merge['cart'] | null) ?? { itemCount: 0, items: [] };

describe('a guest bag, read without signing in', () => {
  it('is priced from the catalogue, whatever the device believes', async () => {
    const a = await variant();
    const b = await variant();
    await setStock(a.id, 9);
    await setStock(b.id, 9);
    const bag = await guestBag([
      { variantId: a.id, quantity: 2 },
      { variantId: b.id, quantity: 1 },
    ]);
    expect(bag.adjustments).toEqual([]);
    expect(bag.bag).toMatchObject({
      id: 'guest',
      itemCount: 3,
      subtotal: { amount: a.price * 2 + b.price, currency: 'RWF' },
    });
    expect(bag.bag.items.map((line) => [line.id, line.quantity, line.lineTotal.amount])).toEqual([
      [a.id, 2, a.price * 2],
      [b.id, 1, b.price],
    ]);
    expect(bag.bag.items[0]?.product.name).toBe(a.productName);
  });

  it('shows a changed price on the next read', async () => {
    const a = await variant();
    await setStock(a.id, 9);
    const before = await guestBag([{ variantId: a.id, quantity: 2 }]);
    await t.db
      .update(schema.productVariants)
      .set({ priceAmount: a.price + 500 })
      .where(eq(schema.productVariants.id, a.id));
    const after = await guestBag([{ variantId: a.id, quantity: 2 }]);
    expect(before.bag.subtotal.amount).toBe(a.price * 2);
    expect(after.bag.subtotal.amount).toBe((a.price + 500) * 2);
    expect(after.bag.items[0]?.variant.price.amount).toBe(a.price + 500);
  });

  it('adds up repeated lines and keeps quantities within the per-order limit and the stock', async () => {
    const a = await variant();
    const b = await variant();
    await setStock(a.id, 50);
    await setStock(b.id, 3);
    const bag = await guestBag([
      { variantId: a.id, quantity: 15 },
      { variantId: a.id, quantity: 15 },
      { variantId: b.id, quantity: 5 },
    ]);
    expect(bag.bag.items.map((line) => [line.id, line.quantity])).toEqual([
      [a.id, 20],
      [b.id, 3],
    ]);
    expect(bag.adjustments).toEqual([
      { variantId: a.id, productName: a.productName, requested: 30, quantity: 20, reason: 'QUANTITY_LIMIT' },
      { variantId: b.id, productName: b.productName, requested: 5, quantity: 3, reason: 'LIMITED_STOCK' },
    ]);
  });

  it('keeps a sold-out piece visible as out of stock, and leaves out what is no longer sold or never existed', async () => {
    const soldOut = await variant();
    const hidden = await variant();
    await setStock(soldOut.id, 0);
    await setStock(hidden.id, 9);
    await t.db
      .update(schema.productVariants)
      .set({ isActive: false })
      .where(eq(schema.productVariants.id, hidden.id));
    const unknown = randomUUID();
    const bag = await guestBag([
      { variantId: soldOut.id, quantity: 1 },
      { variantId: hidden.id, quantity: 2 },
      { variantId: unknown, quantity: 1 },
    ]);
    expect(bag.bag.items).toHaveLength(1);
    expect(bag.bag.items[0]).toMatchObject({ id: soldOut.id, variant: { inStock: false } });
    expect(bag.adjustments.map((entry) => [entry.variantId, entry.reason, entry.quantity])).toEqual([
      [soldOut.id, 'OUT_OF_STOCK', 0],
      [hidden.id, 'UNAVAILABLE', 0],
      [unknown, 'UNAVAILABLE', 0],
    ]);
    expect(bag.adjustments[2]?.productName).toBeNull();
  });

  it('holds no stock and saves nothing', async () => {
    const a = await variant();
    await setStock(a.id, 4);
    await guestBag([{ variantId: a.id, quantity: 4 }]);
    const [stock] = await t.db
      .select()
      .from(schema.inventoryItems)
      .where(eq(schema.inventoryItems.variantId, a.id));
    expect(stock).toMatchObject({ quantityOnHand: 4, quantityReserved: 0 });
    // Another visitor is offered the same four.
    expect((await guestBag([{ variantId: a.id, quantity: 4 }])).adjustments).toEqual([]);
  });

  it('refuses malformed bags', async () => {
    expect(errorCode(await t.gql(BAG, { items: [{ variantId: 'not-an-id', quantity: 1 }] }))).toBe(
      'VALIDATION_FAILED',
    );
    expect(errorCode(await t.gql(BAG, { items: [{ variantId: randomUUID(), quantity: 0 }] }))).toBe(
      'VALIDATION_FAILED',
    );
    const tooMany = Array.from({ length: 51 }, () => ({ variantId: randomUUID(), quantity: 1 }));
    expect(errorCode(await t.gql(BAG, { items: tooMany }))).toBe('VALIDATION_FAILED');
  });
});

describe('merging a guest bag on sign-in', () => {
  it('needs a signed-in customer', async () => {
    const a = await variant();
    const response = await t.gql(MERGE, {
      input: { mergeKey: randomUUID(), items: [{ variantId: a.id, quantity: 1 }] },
    });
    expect(errorCode(response)).toBe('UNAUTHENTICATED');
  });

  it('adds the bag to an empty cart, once, however often it is sent', async () => {
    const customer = await t.registerCustomer();
    const a = await variant();
    const b = await variant();
    await setStock(a.id, 9);
    await setStock(b.id, 9);
    const key = randomUUID();
    const items = [
      { variantId: a.id, quantity: 2 },
      { variantId: b.id, quantity: 1 },
    ];

    const first = await merge(customer.accessToken, key, items);
    expect(first).toMatchObject({ alreadyMerged: false, adjustments: [], cart: { itemCount: 3 } });

    const again = await merge(customer.accessToken, key, items);
    expect(again).toMatchObject({ alreadyMerged: true, adjustments: [], cart: { itemCount: 3 } });
    // Even several at once, as two open tabs would send.
    await Promise.all([merge(customer.accessToken, key, items), merge(customer.accessToken, key, items)]);
    expect(await cartOf(customer.accessToken)).toMatchObject({ itemCount: 3 });
    const recorded = await t.db
      .select()
      .from(schema.guestBagMerges)
      .where(eq(schema.guestBagMerges.mergeKey, key));
    expect(recorded).toHaveLength(1);
  });

  it('combines matching pieces with what the customer already had', async () => {
    const customer = await t.registerCustomer();
    const a = await variant();
    const b = await variant();
    await setStock(a.id, 9);
    await setStock(b.id, 9);
    await t.gql(
      'mutation ($id: ID!) { addToCart(variantId: $id, quantity: 2) { id } }',
      { id: a.id },
      {
        token: customer.accessToken,
      },
    );
    const merged = await merge(customer.accessToken, randomUUID(), [
      { variantId: a.id, quantity: 3 },
      { variantId: b.id, quantity: 1 },
    ]);
    expect(merged.adjustments).toEqual([]);
    expect(merged.cart.items.map((line) => [line.variant.id, line.quantity])).toEqual([
      [a.id, 5],
      [b.id, 1],
    ]);
    expect(merged.cart.subtotal.amount).toBe(a.price * 5 + b.price);
  });

  it('says what could not be added in full: limited stock, the per-order limit, sold out and no longer sold', async () => {
    const customer = await t.registerCustomer();
    const limited = await variant();
    const capped = await variant();
    const soldOut = await variant();
    const hidden = await variant();
    await setStock(limited.id, 3);
    await setStock(capped.id, 50);
    await setStock(soldOut.id, 9);
    await setStock(hidden.id, 9);
    await t.gql(
      'mutation ($id: ID!) { addToCart(variantId: $id, quantity: 2) { id } }',
      { id: limited.id },
      {
        token: customer.accessToken,
      },
    );
    await t.gql(
      'mutation ($id: ID!) { addToCart(variantId: $id, quantity: 18) { id } }',
      { id: capped.id },
      {
        token: customer.accessToken,
      },
    );
    await setStock(soldOut.id, 0);
    await t.db
      .update(schema.productVariants)
      .set({ isActive: false })
      .where(eq(schema.productVariants.id, hidden.id));

    const merged = await merge(customer.accessToken, randomUUID(), [
      { variantId: limited.id, quantity: 4 },
      { variantId: capped.id, quantity: 5 },
      { variantId: soldOut.id, quantity: 1 },
      { variantId: hidden.id, quantity: 1 },
    ]);
    expect(
      merged.adjustments.map((entry) => [entry.variantId, entry.reason, entry.requested, entry.quantity]),
    ).toEqual([
      [limited.id, 'LIMITED_STOCK', 4, 3],
      [capped.id, 'QUANTITY_LIMIT', 5, 20],
      [soldOut.id, 'OUT_OF_STOCK', 1, 0],
      [hidden.id, 'UNAVAILABLE', 1, 0],
    ]);
    expect(merged.adjustments[0]?.productName).toBe(limited.productName);
    const cart = await cartOf(customer.accessToken);
    const quantities = new Map(cart.items.map((line) => [line.variant.id, line.quantity]));
    expect(quantities.get(limited.id)).toBe(3);
    expect(quantities.get(capped.id)).toBe(20);
    expect(quantities.has(soldOut.id)).toBe(false);
    expect(quantities.has(hidden.id)).toBe(false);
  });

  it('keeps each customer’s merges apart, and a new bag from the same device merges again', async () => {
    const first = await t.registerCustomer();
    const second = await t.registerCustomer();
    const a = await variant();
    await setStock(a.id, 20);
    const key = randomUUID();
    const items = [{ variantId: a.id, quantity: 1 }];
    expect((await merge(first.accessToken, key, items)).alreadyMerged).toBe(false);
    expect((await merge(second.accessToken, key, items)).alreadyMerged).toBe(false);
    expect((await merge(first.accessToken, randomUUID(), items)).cart.itemCount).toBe(2);
    expect(await cartOf(second.accessToken)).toMatchObject({ itemCount: 1 });
  });
});
