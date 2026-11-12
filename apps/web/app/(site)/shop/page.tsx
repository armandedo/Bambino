import {
  CatalogueFiltersQuery,
  type ProductFilter,
  type ProductSort,
  ProductsQuery,
} from '@bambino/api-client';
import { Button, EmptyState, SelectField, TextField, buttonClasses, cn } from '@bambino/ui';
import type { Metadata } from 'next';
import NextLink from 'next/link';
import { ApiErrorState } from '@/components/api-error';
import { ProductCard } from '@/components/product-card';
import { ShopFilters } from '@/components/storefront/shop-filters';
import { load } from '@/lib/api';
import { SHOP_AGES, shopAgeBySlug } from '@/lib/shop-ages';
import { displaySizeLabel } from '@/lib/size-label';

export const metadata: Metadata = { title: 'Shop' };

const SORTS: { value: ProductSort; label: string }[] = [
  { value: 'NEWEST', label: 'Newest' },
  { value: 'PRICE_ASC', label: 'Price: low to high' },
  { value: 'PRICE_DESC', label: 'Price: high to low' },
  { value: 'NAME_ASC', label: 'Name' },
];

const PILL =
  'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 whitespace-nowrap transition-colors';
const PILL_ON = 'border-primary bg-primary font-semibold text-primary-foreground';
const PILL_OFF = 'border-border bg-surface font-medium hover:border-primary hover:bg-accent-soft';
const PILL_ROW =
  'no-scrollbar -mx-[var(--gutter)] flex gap-2 overflow-x-auto px-[var(--gutter)] py-2 lg:mx-0 lg:flex-wrap lg:px-0';
const CRUMB = 'rounded-sm underline underline-offset-4 hover:text-foreground';

function one(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() ? first.trim() : undefined;
}

/** A whole number of francs from a query string, or undefined when it is empty or not a number. */
function toAmount(value: string | undefined): number | undefined {
  if (!value || !/^\d{1,9}$/.test(value)) return undefined;
  return Number(value);
}

function hrefWith(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const text = search.toString();
  return text ? `/shop?${text}` : '/shop';
}

/** Filters live in the URL, so results are shareable and the form works without JavaScript. */
export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = one(params.q);
  const category = one(params.category);
  const size = one(params.size);
  const age = shopAgeBySlug(one(params.age));
  const after = one(params.after);
  const minPrice = toAmount(one(params.min));
  const maxPrice = toAmount(one(params.max));
  const sortParam = one(params.sort);
  const sort = SORTS.find((s) => s.value === sortParam)?.value ?? 'NEWEST';

  const filter: ProductFilter = {
    oneTimeEligible: true,
    ...(q ? { search: q } : {}),
    ...(category ? { categorySlug: category } : {}),
    ...(size ? { sizeCodes: [size] } : age ? { sizeCodes: [...age.sizeCodes] } : {}),
    ...(minPrice !== undefined ? { minPrice } : {}),
    ...(maxPrice !== undefined ? { maxPrice } : {}),
    inStockOnly: true,
  };
  const [filters, products] = await Promise.all([
    load(CatalogueFiltersQuery),
    load(ProductsQuery, { filter, sort, first: 24, ...(after ? { after } : {}) }),
  ]);
  const categories = filters.ok ? filters.data.categories : [];
  const sizes = (filters.ok ? [...filters.data.sizes].sort((a, b) => a.sortOrder - b.sortOrder) : []).filter(
    (s) => !age || age.sizeCodes.includes(s.code),
  );
  const keep = {
    q,
    size,
    age: age?.slug,
    min: minPrice?.toString(),
    max: maxPrice?.toString(),
    sort: sort === 'NEWEST' ? undefined : sort,
  };
  const categoryName = categories.find((item) => item.slug === category)?.name;
  const ageTitle = age ? `${age.label}, ${age.ages}` : undefined;
  const title = categoryName ?? ageTitle ?? (q ? `Results for “${q}”` : 'Shop everything');
  const crumb = categoryName ?? age?.label;
  const narrowed = Boolean(q || category || size || minPrice !== undefined || maxPrice !== undefined);

  return (
    <div className="retail-container flex flex-col gap-5 pt-5 pb-14 md:gap-6 md:pt-8 lg:pb-20">
      <div className="flex flex-col gap-2">
        <nav aria-label="Breadcrumb" className="text-[15px] text-foreground-muted">
          <ol className="flex flex-wrap items-center gap-x-2">
            <li>
              <NextLink href="/" className={CRUMB}>
                Home
              </NextLink>
            </li>
            <li aria-hidden="true">/</li>
            {crumb ? (
              <>
                <li>
                  <NextLink href="/shop" className={CRUMB}>
                    Shop
                  </NextLink>
                </li>
                <li aria-hidden="true">/</li>
                <li aria-current="page" className="text-foreground">
                  {crumb}
                </li>
              </>
            ) : (
              <li aria-current="page" className="text-foreground">
                Shop
              </li>
            )}
          </ol>
        </nav>
        <h1 className="text-[clamp(2rem,4.6vw,3.5rem)] leading-[1.05] font-semibold tracking-[-0.045em]">
          {title}
        </h1>
        {categoryName && ageTitle ? <p className="text-lg text-foreground-muted">{ageTitle}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <nav aria-label="Age groups">
          <ul className={PILL_ROW}>
            {[{ slug: undefined, label: 'All ages', ages: '' }, ...SHOP_AGES].map((group) => {
              const active = group.slug === age?.slug;
              return (
                <li key={group.slug ?? 'all'} className="shrink-0">
                  <NextLink
                    href={hrefWith({ ...keep, size: undefined, age: group.slug, category })}
                    aria-current={active ? 'page' : undefined}
                    className={cn(PILL, active ? PILL_ON : PILL_OFF)}
                  >
                    {group.label}
                    {group.ages ? (
                      <span
                        className={cn(
                          'text-[15px] font-normal',
                          active ? 'opacity-85' : 'text-foreground-muted',
                        )}
                      >
                        {group.ages}
                      </span>
                    ) : null}
                  </NextLink>
                </li>
              );
            })}
          </ul>
        </nav>

        {categories.length > 0 ? (
          <nav aria-label="Categories">
            <ul className={PILL_ROW}>
              {[{ slug: undefined, name: 'All types' }, ...categories].map((item) => {
                const active = item.slug === category;
                return (
                  <li key={item.slug ?? 'all'} className="shrink-0">
                    <NextLink
                      href={hrefWith({ ...keep, category: item.slug })}
                      aria-current={active ? 'page' : undefined}
                      className={cn(PILL, active ? PILL_ON : PILL_OFF)}
                    >
                      {item.name}
                    </NextLink>
                  </li>
                );
              })}
            </ul>
          </nav>
        ) : null}
      </div>

      <form
        method="get"
        action="/shop"
        className="grid gap-4 border-y border-border py-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,3.4fr)_auto] lg:items-end"
      >
        {category ? <input type="hidden" name="category" value={category} /> : null}
        {age ? <input type="hidden" name="age" value={age.slug} /> : null}
        <TextField
          id="search"
          label="Search"
          name="q"
          type="search"
          defaultValue={q ?? ''}
          placeholder="Bodysuit, romper…"
        />
        <ShopFilters
          activeCount={
            [size, minPrice !== undefined, maxPrice !== undefined, sort !== 'NEWEST'].filter(Boolean).length
          }
          panelClassName="grid grid-cols-2 items-end gap-4 lg:grid-cols-4"
        >
          <SelectField
            label="Size"
            name="size"
            defaultValue={size ?? ''}
            placeholder="Any size"
            options={sizes.map((s) => ({ value: s.code, label: displaySizeLabel(s.label) }))}
          />
          <SelectField label="Sort by" name="sort" defaultValue={sort} options={SORTS} />
          <TextField
            id="min"
            label="Lowest price (RF)"
            name="min"
            type="number"
            inputMode="numeric"
            min={0}
            defaultValue={minPrice ?? ''}
          />
          <TextField
            id="max"
            label="Highest price (RF)"
            name="max"
            type="number"
            inputMode="numeric"
            min={0}
            defaultValue={maxPrice ?? ''}
          />
        </ShopFilters>
        <Button type="submit">Apply</Button>
      </form>

      <section aria-labelledby="results" className="flex flex-col gap-5">
        <h2 id="results" className="sr-only">
          Results
        </h2>
        {!products.ok ? (
          <ApiErrorState error={products.error} what="products" />
        ) : products.data.products.edges.length === 0 ? (
          age && !narrowed ? (
            <EmptyState
              title={`Nothing in stock for ${age.label.toLowerCase()} (${age.ages}) right now`}
              description="Browse every size in stock, or use the size finder to check what fits them today."
              action={
                <span className="flex flex-wrap justify-center gap-3">
                  <NextLink href="/shop" className={buttonClasses()}>
                    Shop everything
                  </NextLink>
                  <NextLink href="/fit" className={buttonClasses({ variant: 'outline' })}>
                    Find their size
                  </NextLink>
                </span>
              }
            />
          ) : (
            <EmptyState
              title="No clothes match those filters"
              description="Try another size or type, or clear the search."
              action={
                <NextLink href="/shop" className={buttonClasses({ variant: 'outline' })}>
                  Clear filters
                </NextLink>
              }
            />
          )
        ) : (
          <>
            <p className="text-[15px] text-foreground-muted" aria-live="polite">
              {products.data.products.totalCount}{' '}
              {products.data.products.totalCount === 1 ? 'product' : 'products'}
            </p>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-9 md:grid-cols-3 md:gap-x-6 lg:grid-cols-4">
              {products.data.products.edges.map(({ node }) => (
                <li key={node.id} className="flex">
                  <ProductCard product={node} />
                </li>
              ))}
            </ul>
            {products.data.products.pageInfo.hasNextPage || after ? (
              <nav aria-label="Pages" className="flex gap-3">
                {after ? (
                  <NextLink
                    href={hrefWith({ ...keep, category })}
                    className={buttonClasses({ variant: 'outline' })}
                  >
                    First page
                  </NextLink>
                ) : null}
                {products.data.products.pageInfo.hasNextPage && products.data.products.pageInfo.endCursor ? (
                  <NextLink
                    href={hrefWith({ ...keep, category, after: products.data.products.pageInfo.endCursor })}
                    className={buttonClasses({ variant: 'outline' })}
                  >
                    Next page
                  </NextLink>
                ) : null}
              </nav>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
