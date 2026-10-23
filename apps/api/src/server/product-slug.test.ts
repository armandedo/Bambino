import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type TestApp, createTestApp } from '../testing/test-app';

let t: TestApp;
let token: string;
let categoryId: string;

beforeAll(async () => {
  t = await createTestApp({ catalogue: true });
  token = (await t.registerStaff('CONTENT_MANAGER')).accessToken;
  const categories = await t.gql('{ categories { id } }');
  categoryId = (categories.data?.categories as { id: string }[])[0]?.id ?? '';
}, 120_000);

afterAll(async () => {
  await t.close();
});

const CREATE = `mutation ($input: ProductInput!) { adminCreateProduct(input: $input) { id slug name } }`;
const UPDATE = `mutation ($id: ID!, $input: ProductInput!) { adminUpdateProduct(id: $id, input: $input) { id slug name } }`;

const input = (overrides: Record<string, unknown> = {}) => ({
  name: 'Newborn baby clothing gift',
  description: 'A gift set.',
  brand: 'Bambino',
  categoryId,
  subscriptionEligible: false,
  oneTimeEligible: true,
  isActive: false,
  ...overrides,
});

describe('product web address', () => {
  it('is made from the name when none is given, and numbered when the name repeats', async () => {
    const first = await t.gql(CREATE, { input: input() }, { token });
    expect(first.errors).toBeUndefined();
    expect((first.data?.adminCreateProduct as { slug: string }).slug).toBe('newborn-baby-clothing-gift');

    const second = await t.gql(CREATE, { input: input() }, { token });
    expect((second.data?.adminCreateProduct as { slug: string }).slug).toBe('newborn-baby-clothing-gift-2');

    const third = await t.gql(CREATE, { input: input() }, { token });
    expect((third.data?.adminCreateProduct as { slug: string }).slug).toBe('newborn-baby-clothing-gift-3');
  });

  it('still honours an address that is given, and refuses one that is taken', async () => {
    const chosen = await t.gql(
      CREATE,
      { input: input({ name: 'Anything', slug: 'my-own-address' }) },
      { token },
    );
    expect((chosen.data?.adminCreateProduct as { slug: string }).slug).toBe('my-own-address');

    const clash = await t.gql(CREATE, { input: input({ name: 'Other', slug: 'my-own-address' }) }, { token });
    expect(clash.errors?.[0]?.extensions?.reason ?? clash.errors?.[0]?.extensions?.code).toBeDefined();
    expect(clash.data?.adminCreateProduct ?? null).toBeNull();
  });

  it('keeps the address when an edit leaves it out, even if the name changes', async () => {
    const created = await t.gql(CREATE, { input: input({ name: 'Romper for edit test' }) }, { token });
    const product = created.data?.adminCreateProduct as { id: string; slug: string };
    expect(product.slug).toBe('romper-for-edit-test');

    const edited = await t.gql(
      UPDATE,
      { id: product.id, input: input({ name: 'Renamed romper' }) },
      { token },
    );
    expect(edited.errors).toBeUndefined();
    expect(edited.data?.adminUpdateProduct).toMatchObject({
      slug: 'romper-for-edit-test',
      name: 'Renamed romper',
    });
  });

  it('makes a usable address from a name with accents, symbols or nothing usable', async () => {
    const accented = await t.gql(CREATE, { input: input({ name: 'Crème & Sage Romper!' }) }, { token });
    expect((accented.data?.adminCreateProduct as { slug: string }).slug).toBe('creme-and-sage-romper');
    const symbols = await t.gql(CREATE, { input: input({ name: '***' }) }, { token });
    expect((symbols.data?.adminCreateProduct as { slug: string }).slug).toBe('product');
  });
});
