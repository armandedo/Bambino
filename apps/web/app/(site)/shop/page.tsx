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
  const sortParam = one(params.sort);
  const sort = SORTS.find((s) => s.value === sortParam)?.value ?? 'NEWEST';
  const inStock = one(params.inStock) === '1';

  const filter: ProductFilter = {
    ...(q ? { search: q } : {}),
    ...(category ? { categorySlug: category } : {}),
    ...(size ? { sizeCodes: [size] } : {}),
    ...(inStock ? { inStockOnly: true } : {}),
  };
  const [filters, products] = await Promise.all([
    load(CatalogueFiltersQuery),
    load(ProductsQuery, { filter, sort, first: 24 }),
  ]);
  const categories = filters.ok ? filters.data.categories : [];
  const sizes = filters.ok ? [...filters.data.sizes].sort((a, b) => a.sortOrder - b.sortOrder) : [];
  const keep = { q, size, sort: sort === 'NEWEST' ? undefined : sort, inStock: inStock ? '1' : undefined };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-4xl font-extrabold">Shop</h1>
        <p className="text-foreground-muted">Everyday babywear, by size.</p>
      </div>

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
        className="grid items-end gap-4 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto_auto]"
      >
        {category ? <input type="hidden" name="category" value={category} /> : null}
        <TextField
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
          </>
        )}
      </section>
    </div>
  );
}
