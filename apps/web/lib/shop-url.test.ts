import { describe, expect, it } from 'vitest';
import { activeFilterCount, readShopState, shopHref, toAmount } from './shop-url';

describe('readShopState', () => {
  it('keeps every filter the shop understands', () => {
    expect(
      readShopState({
        q: ' romper ',
        age: 'baby',
        category: 'sleepwear',
        size: '3-6M',
        min: '2000',
        max: '9000',
        stock: 'all',
        sort: 'PRICE_ASC',
        after: 'abc',
        page: '2',
      }),
    ).toEqual({
      q: 'romper',
      age: 'baby',
      category: 'sleepwear',
      size: '3-6M',
      min: '2000',
      max: '9000',
      stock: 'all',
      sort: 'PRICE_ASC',
      after: 'abc',
      page: '2',
    });
  });

  it('drops values it does not understand', () => {
    const state = readShopState({ stock: 'none', sort: 'CHEAPEST', min: '-5', max: '12.5', page: '3' });
    expect(state.stock).toBeUndefined();
    expect(state.sort).toBeUndefined();
    expect(state.min).toBeUndefined();
    expect(state.max).toBeUndefined();
    // A page number means nothing without the cursor it belongs to.
    expect(state.page).toBeUndefined();
  });

  it('treats the default sort as no sort, and takes the first of a repeated parameter', () => {
    expect(readShopState({ sort: 'NEWEST', q: ['hat', 'sock'] })).toMatchObject({
      sort: undefined,
      q: 'hat',
    });
  });
});

describe('shopHref', () => {
  it('is the plain shop address when nothing is chosen', () => {
    expect(shopHref({})).toBe('/shop');
  });

  it('keeps the other filters when one changes', () => {
    expect(shopHref({ q: 'romper', age: 'baby', sort: 'PRICE_ASC' }, { size: '3-6M' })).toBe(
      '/shop?q=romper&age=baby&size=3-6M&sort=PRICE_ASC',
    );
  });

  it('removes a filter that is set to undefined', () => {
    expect(shopHref({ q: 'romper', size: '3-6M' }, { size: undefined })).toBe('/shop?q=romper');
  });

  it('goes back to the first page when a filter changes', () => {
    expect(shopHref({ age: 'baby', after: 'abc', page: '2' }, { stock: 'all' })).toBe(
      '/shop?age=baby&stock=all',
    );
  });

  it('keeps the filters when moving to the next page', () => {
    expect(shopHref({ age: 'baby', max: '9000' }, { after: 'abc', page: '2' })).toBe(
      '/shop?age=baby&max=9000&after=abc&page=2',
    );
  });

  it('round-trips through readShopState', () => {
    const href = shopHref({ q: 'two words', category: 'tops', min: '1000', stock: 'all' });
    const params = Object.fromEntries(new URLSearchParams(href.split('?')[1]));
    expect(shopHref(readShopState(params))).toBe(href);
  });
});

describe('filter helpers', () => {
  it('counts only the narrowing filters', () => {
    expect(activeFilterCount({ q: 'hat', age: 'baby', sort: 'PRICE_ASC' })).toBe(0);
    expect(activeFilterCount({ size: '3-6M', min: '1000', stock: 'all' })).toBe(3);
  });

  it('reads whole francs', () => {
    expect(toAmount('2500')).toBe(2500);
    expect(toAmount('')).toBeUndefined();
    expect(toAmount('2,500')).toBeUndefined();
  });
});
