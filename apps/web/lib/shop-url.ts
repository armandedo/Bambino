import type { ProductSort } from '@bambino/api-client';

/**
 * Everything the shop can be narrowed by lives in the URL, so a filtered page can be shared, bookmarked and
 * reached again with the back button. This file is the one place that reads and writes those addresses.
 */
export interface ShopState {
  q?: string | undefined;
  age?: string | undefined;
  category?: string | undefined;
  size?: string | undefined;
  /** Whole francs, kept as typed so the fields show what the shopper entered. */
  min?: string | undefined;
  max?: string | undefined;
  /** `all` also shows sold-out clothes. Anything else means in stock only. */
  stock?: string | undefined;
  sort?: string | undefined;
  /** Cursor of the page being shown, and its number for the "Page 2" label. */
  after?: string | undefined;
  page?: string | undefined;
}

export const SHOP_SORTS: { value: ProductSort; label: string }[] = [
  { value: 'NEWEST', label: 'Newest' },
  { value: 'PRICE_ASC', label: 'Price: low to high' },
  { value: 'PRICE_DESC', label: 'Price: high to low' },
  { value: 'NAME_ASC', label: 'Name: A to Z' },
];

export const DEFAULT_SORT: ProductSort = 'NEWEST';
export const SHOP_PAGE_SIZE = 40;

const KEYS = ['q', 'age', 'category', 'size', 'min', 'max', 'stock', 'sort', 'after', 'page'] as const;

function clean(value: string | string[] | null | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  const text = first?.trim();
  return text ? text : undefined;
}

/** Reads the shop state from a page's search params, dropping values the shop does not understand. */
export function readShopState(params: Record<string, string | string[] | undefined>): ShopState {
  const state: ShopState = {};
  for (const key of KEYS) state[key] = clean(params[key]);
  if (state.stock !== 'all') state.stock = undefined;
  if (!SHOP_SORTS.some((sort) => sort.value === state.sort) || state.sort === DEFAULT_SORT) {
    state.sort = undefined;
  }
  if (!isAmount(state.min)) state.min = undefined;
  if (!isAmount(state.max)) state.max = undefined;
  if (!state.after || !/^[1-9]\d{0,3}$/.test(state.page ?? '')) state.page = undefined;
  return state;
}

function isAmount(value: string | undefined): value is string {
  return value !== undefined && /^\d{1,9}$/.test(value);
}

/** A whole number of francs, or undefined when the field is empty. */
export function toAmount(value: string | undefined): number | undefined {
  return isAmount(value) ? Number(value) : undefined;
}

/** The shop address for a state. Changing any filter starts again from the first page. */
export function shopHref(state: ShopState, change: Partial<ShopState> = {}): string {
  const paging = 'after' in change ? {} : { after: undefined, page: undefined };
  const next: ShopState = { ...state, ...paging, ...change };
  const search = new URLSearchParams();
  for (const key of KEYS) {
    const value = next[key];
    if (value) search.set(key, value);
  }
  const text = search.toString();
  return text ? `/shop?${text}` : '/shop';
}

/** How many of the shop's narrowing filters are on (search, tabs and sorting are not counted). */
export function activeFilterCount(state: ShopState): number {
  return [state.size, state.min, state.max, state.stock].filter(Boolean).length;
}
