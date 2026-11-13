import { CatalogueFiltersQuery, type ProductFilter, ProductsQuery } from '@bambino/api-client';
import { EmptyState, MoneyText, buttonClasses, cn } from '@bambino/ui';
import { X } from 'lucide-react';
import NextLink from 'next/link';
import type { ReactNode } from 'react';
import { ApiErrorState } from '@/components/api-error';
import { ProductCard } from '@/components/product-card';
import { load } from '@/lib/api';
import { SHOP_AGES, shopAgeBySlug } from '@/lib/shop-ages';
import {
  DEFAULT_SORT,
  SHOP_PAGE_SIZE,
  SHOP_SORTS,
  type ShopState,
  readShopState,
  shopHref,
  toAmount,
} from '@/lib/shop-url';
import { displaySizeLabel } from '@/lib/size-label';
import { FilterBar } from './filter-bar';

export type ShopSearchParams = Promise<Record<string, string | string[] | undefined>>;

const SCROLL_ROW = 'no-scrollbar -mx-[var(--gutter)] flex overflow-x-auto px-[var(--gutter)]';
const TAB =
  'flex min-h-12 shrink-0 flex-col justify-center border-b-2 px-3 py-1.5 leading-tight whitespace-nowrap';
const CHIP =
  'inline-flex min-h-9 shrink-0 items-center rounded-full border px-3.5 text-sm whitespace-nowrap transition-colors';
const CHIP_ON = 'border-primary bg-primary font-semibold text-primary-foreground';
const CHIP_OFF = 'border-border bg-surface font-medium hover:border-border-strong';
export const PRODUCT_GRID = 'grid grid-cols-2 gap-x-2.5 gap-y-5 md:grid-cols-4 md:gap-x-3 xl:grid-cols-5';

function Removable({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <li>
      <NextLink
        href={href}
        scroll={false}
        aria-label={`Remove filter: ${label}`}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-accent-soft py-1 pr-2.5 pl-3 text-sm font-medium"
      >
        {children}
        <X aria-hidden="true" className="size-3.5" strokeWidth={2.4} />
      </NextLink>
    </li>
  );
}

/**
 * The shop: age tabs, category tabs, filters, sorting and the product grid. It is the home page and /shop.
 * Everything a shopper chooses is read from the address, so results can be shared and survive a refresh.
 */
export async function ShopView({ searchParams }: { searchParams: ShopSearchParams }) {
  const raw = readShopState(await searchParams);
  const age = shopAgeBySlug(raw.age);
  const filters = await load(CatalogueFiltersQuery);
  const categories = filters.ok ? filters.data.categories : [];
  const allSizes = filters.ok ? [...filters.data.sizes].sort((a, b) => a.sortOrder - b.sortOrder) : [];
  const sizes = allSizes.filter((size) => !age || age.sizeCodes.includes(size.code));
  const category = categories.find((item) => item.slug === raw.category);
  const size = sizes.find((item) => item.code === raw.size);

  // What the page actually acts on: values that do not exist (an old link, a typo) are dropped, not shown.
  const state: ShopState = {
    ...raw,
    age: age?.slug,
    category: filters.ok ? category?.slug : raw.category,
    size: filters.ok ? size?.code : raw.size,
  };
  const minPrice = toAmount(state.min);
  const maxPrice = toAmount(state.max);
  const sort = SHOP_SORTS.find((item) => item.value === state.sort)?.value ?? DEFAULT_SORT;
  const page = state.page ? Number(state.page) : 1;

  const filter: ProductFilter = {
    oneTimeEligible: true,
    ...(state.q ? { search: state.q } : {}),
    ...(state.category ? { categorySlug: state.category } : {}),
    ...(state.size ? { sizeCodes: [state.size] } : age ? { sizeCodes: [...age.sizeCodes] } : {}),
    ...(minPrice !== undefined ? { minPrice } : {}),
    ...(maxPrice !== undefined ? { maxPrice } : {}),
    ...(state.stock === 'all' ? {} : { inStockOnly: true }),
  };
  const products = await load(ProductsQuery, {
    filter,
    sort,
    first: SHOP_PAGE_SIZE,
    ...(state.after ? { after: state.after } : {}),
  });

  const title = state.q
    ? `Results for “${state.q}”`
    : (category?.name ?? (age ? `${age.label} clothes` : 'All clothes'));
  const narrowed = Boolean(state.q || state.size || state.min || state.max || state.stock);
  const total = products.ok ? products.data.products.totalCount : 0;
  const items = products.ok ? products.data.products.edges : [];
  const pageInfo = products.ok ? products.data.products.pageInfo : null;

  return (
    <div className="retail-container flex flex-col pb-10">
      <nav aria-label="Age groups" className="border-b border-border">
        <ul className={SCROLL_ROW}>
          {[{ slug: undefined, label: 'All ages', ages: 'Newborn to 17' }, ...SHOP_AGES].map((group) => {
            const active = group.slug === age?.slug;
            return (
              <li key={group.slug ?? 'all'} className="-mb-px flex">
                <NextLink
                  href={shopHref(state, { age: group.slug, size: undefined })}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    TAB,
                    active
                      ? 'border-primary font-semibold'
                      : 'border-transparent font-medium hover:border-border-strong',
                  )}
                >
                  <span className="text-[15px]">{group.label}</span>
                  <span className="text-xs font-normal text-foreground-muted">{group.ages}</span>
                </NextLink>
              </li>
            );
          })}
        </ul>
      </nav>

      {categories.length > 0 ? (
        <nav aria-label="Categories" className="pt-2.5">
          <ul className={cn(SCROLL_ROW, 'gap-1.5 py-0.5')}>
            {[{ id: 'all', slug: undefined, name: 'All' }, ...categories].map((item) => {
              const active = item.slug === state.category;
              return (
                <li key={item.id} className="flex">
                  <NextLink
                    href={shopHref(state, { category: item.slug })}
                    aria-current={active ? 'page' : undefined}
                    className={cn(CHIP, active ? CHIP_ON : CHIP_OFF)}
                  >
                    {item.name}
                  </NextLink>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}

      <div className="flex flex-col gap-2.5 pt-3.5 pb-3">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <h1 className="text-xl font-semibold tracking-[-0.01em]">{title}</h1>
          {products.ok ? (
            <p className="text-sm text-foreground-muted" role="status">
              {total} {total === 1 ? 'item' : 'items'}
              {page > 1 ? `, page ${page}` : ''}
            </p>
          ) : null}
        </div>
        <FilterBar
          state={state}
          sizes={sizes.map((item) => ({ code: item.code, label: displaySizeLabel(item.label) }))}
        />
        {narrowed ? (
          <ul aria-label="Filters in use" className="flex flex-wrap items-center gap-1.5">
            {state.q ? (
              <Removable href={shopHref(state, { q: undefined })} label={`search for ${state.q}`}>
                “{state.q}”
              </Removable>
            ) : null}
            {size ? (
              <Removable href={shopHref(state, { size: undefined })} label={`size ${size.code}`}>
                Size {displaySizeLabel(size.label)}
              </Removable>
            ) : null}
            {minPrice !== undefined ? (
              <Removable href={shopHref(state, { min: undefined })} label="lowest price">
                From <MoneyText value={{ amount: minPrice, currency: 'RWF' }} />
              </Removable>
            ) : null}
            {maxPrice !== undefined ? (
              <Removable href={shopHref(state, { max: undefined })} label="highest price">
                Up to <MoneyText value={{ amount: maxPrice, currency: 'RWF' }} />
              </Removable>
            ) : null}
            {state.stock ? (
              <Removable href={shopHref(state, { stock: undefined })} label="including sold out">
                Including sold out
              </Removable>
            ) : null}
            <li>
              <NextLink
                href={shopHref({ age: state.age, category: state.category, sort: state.sort })}
                scroll={false}
                className="inline-flex min-h-9 items-center rounded-md px-2 text-sm font-medium underline underline-offset-4"
              >
                Clear all
              </NextLink>
            </li>
          </ul>
        ) : null}
      </div>

      {!products.ok ? (
        <ApiErrorState error={products.error} what="the shop" />
      ) : items.length === 0 ? (
        <EmptyState
          title={narrowed ? 'No clothes match these filters' : 'Nothing here yet'}
          description={
            narrowed
              ? 'Try removing a filter or searching for something else.'
              : 'There are no clothes in this section right now. Try another age or category.'
          }
          action={
            <NextLink
              href={narrowed ? shopHref({ age: state.age, category: state.category }) : '/shop'}
              className={buttonClasses({ variant: 'outline' })}
            >
              {narrowed ? 'Clear filters' : 'See all clothes'}
            </NextLink>
          }
        />
      ) : (
        <>
          <ul className={PRODUCT_GRID}>
            {items.map(({ node }, index) => (
              <li key={node.id} className="min-w-0">
                <ProductCard product={node} priority={index < 5} />
              </li>
            ))}
          </ul>
          {pageInfo?.hasNextPage || state.after ? (
            <nav aria-label="Pages" className="flex flex-wrap items-center justify-center gap-3 pt-8">
              {state.after ? (
                <NextLink href={shopHref(state)} className={buttonClasses({ variant: 'ghost' })}>
                  Back to first page
                </NextLink>
              ) : null}
              {pageInfo?.hasNextPage && pageInfo.endCursor ? (
                <NextLink
                  href={shopHref(state, { after: pageInfo.endCursor, page: String(page + 1) })}
                  className={buttonClasses({ variant: 'outline' })}
                >
                  Next page
                </NextLink>
              ) : null}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
