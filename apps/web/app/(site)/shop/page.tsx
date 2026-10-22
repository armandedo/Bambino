import { AGE_GROUPS, ageGroupBySlug } from '@bambino/config';
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
import { load } from '@/lib/api';

export const metadata: Metadata = { title: 'Shop' };

const SORTS: { value: ProductSort; label: string }[] = [
  { value: 'NEWEST', label: 'Newest' },
  { value: 'PRICE_ASC', label: 'Price: low to high' },
  { value: 'PRICE_DESC', label: 'Price: high to low' },
  { value: 'NAME_ASC', label: 'Name' },
];

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
  const age = ageGroupBySlug(one(params.age));
  const after = one(params.after);
  const minPrice = toAmount(one(params.min));
  const maxPrice = toAmount(one(params.max));
  const sortParam = one(params.sort);
  const sort = SORTS.find((s) => s.value === sortParam)?.value ?? 'NEWEST';
  const inStock = one(params.inStock) === '1';

  const filter: ProductFilter = {
    ...(q ? { search: q } : {}),
    ...(category ? { categorySlug: category } : {}),
    ...(size ? { sizeCodes: [size] } : age ? { sizeCodes: [...age.sizeCodes] } : {}),
    ...(minPrice !== undefined ? { minPrice } : {}),
    ...(maxPrice !== undefined ? { maxPrice } : {}),
    ...(inStock ? { inStockOnly: true } : {}),
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
    inStock: inStock ? '1' : undefined,
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-4xl font-semibold">Shop</h1>
        <p className="text-foreground-muted">
          {age ? `${age.label}, ${age.ages}. ${age.blurb}` : 'Everyday babywear, by age and size.'}
        </p>
      </div>

      <nav aria-label="Age groups">
        <ul className="flex flex-wrap gap-2">
          {[{ slug: undefined, label: 'All ages', ages: '' }, ...AGE_GROUPS].map((group) => {
            const active = group.slug === age?.slug;
            return (
              <li key={group.slug ?? 'all'}>
                <NextLink
                  href={hrefWith({ ...keep, size: undefined, age: group.slug, category })}
                  aria-current={active ? 'page' : undefined}
                  className={cn(buttonClasses({ size: 'sm', variant: active ? 'primary' : 'outline' }))}
                >
                  {group.label}
                  {group.ages ? <span className="ml-1 font-normal opacity-80">({group.ages})</span> : null}
                </NextLink>
              </li>
            );
          })}
        </ul>
      </nav>

      {categories.length > 0 ? (
        <nav aria-label="Categories">
          <ul className="flex flex-wrap gap-2">
            {[{ slug: undefined, name: 'All' }, ...categories].map((item) => {
              const active = item.slug === category;
              return (
                <li key={item.slug ?? 'all'}>
                  <NextLink
                    href={hrefWith({ ...keep, category: item.slug })}
                    aria-current={active ? 'page' : undefined}
                    className={cn(buttonClasses({ size: 'sm', variant: active ? 'primary' : 'outline' }))}
                  >
                    {item.name}
                  </NextLink>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}

      <form
        method="get"
        action="/shop"
        className="grid items-end gap-4 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4"
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
        <SelectField
          label="Size"
          name="size"
          defaultValue={size ?? ''}
          placeholder="Any size"
          options={sizes.map((s) => ({ value: s.code, label: s.label }))}
        />
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
        <SelectField label="Sort by" name="sort" defaultValue={sort} options={SORTS} />
        <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="inStock"
            value="1"
            defaultChecked={inStock}
            className="size-5 accent-primary"
          />
          In stock only
        </label>
        <Button type="submit">Apply</Button>
      </form>

      <section aria-labelledby="results" className="flex flex-col gap-4">
        <h2 id="results" className="sr-only">
          Results
        </h2>
        {!products.ok ? (
          <ApiErrorState error={products.error} what="products" />
        ) : products.data.products.edges.length === 0 ? (
          <EmptyState
            title="No products match"
            description="Try another size or category, or clear the search."
            action={
              <NextLink href="/shop" className={buttonClasses({ variant: 'outline' })}>
                Clear filters
              </NextLink>
            }
          />
        ) : (
          <>
            <p className="text-sm text-foreground-muted" aria-live="polite">
              {products.data.products.totalCount}{' '}
              {products.data.products.totalCount === 1 ? 'product' : 'products'}
            </p>
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
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
