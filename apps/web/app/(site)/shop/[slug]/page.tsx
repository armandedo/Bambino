import { ProductQuery, ProductsQuery } from '@bambino/api-client';
import { MoneyText } from '@bambino/ui';
import type { Metadata } from 'next';
import NextLink from 'next/link';
import { notFound } from 'next/navigation';
import { AddToCart } from '@/components/add-to-cart';
import { ApiErrorState } from '@/components/api-error';
import { ProductCard } from '@/components/product-card';
import { ProductGallery } from '@/components/storefront/product-gallery';
import { PRODUCT_GRID } from '@/components/storefront/shop-view';
import { load } from '@/lib/api';

type Params = Promise<{ slug: string }>;

const CRUMB = 'rounded-sm underline underline-offset-4 hover:text-foreground';
const MORE_COUNT = 5;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const result = await load(ProductQuery, { slug });
  return { title: result.ok && result.data.product ? result.data.product.name : 'Product' };
}

export default async function ProductPage({ params }: { params: Params }) {
  const { slug } = await params;
  const result = await load(ProductQuery, { slug });
  if (!result.ok) {
    return (
      <div className="retail-container py-10">
        <ApiErrorState error={result.error} what="this product" />
      </div>
    );
  }
  const product = result.data.product;
  if (!product) notFound();

  // More to browse from the same shelf. If this read fails the product page still stands on its own.
  const related = await load(ProductsQuery, {
    filter: { oneTimeEligible: true, inStockOnly: true, categorySlug: product.category.slug },
    first: MORE_COUNT + 1,
  });
  const more = related.ok
    ? related.data.products.edges
        .map((edge) => edge.node)
        .filter((item) => item.id !== product.id)
        .slice(0, MORE_COUNT)
    : [];

  const details = [
    { label: 'Material', value: product.material },
    { label: 'Care', value: product.careInstructions },
    { label: 'Sustainability', value: product.sustainabilityInfo },
  ].filter((row): row is { label: string; value: string } => Boolean(row.value?.trim()));
  const prices = new Set(product.variants.map((variant) => variant.price.amount));
  const categoryHref = `/shop?category=${encodeURIComponent(product.category.slug)}`;

  return (
    <div className="retail-container flex flex-col gap-4 pt-3 pb-10 md:pt-4">
      <nav aria-label="Breadcrumb" className="text-sm text-foreground-muted">
        <ol className="flex flex-wrap items-center gap-x-2">
          <li>
            <NextLink href="/shop" className={CRUMB}>
              Shop
            </NextLink>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <NextLink href={categoryHref} className={CRUMB}>
              {product.category.name}
            </NextLink>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-foreground">
            {product.name}
          </li>
        </ol>
      </nav>

      <div className="grid gap-5 md:grid-cols-2 md:gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-12">
        <ProductGallery
          product={{
            id: product.id,
            slug: product.slug,
            name: product.name,
            images: product.images,
            priceFrom: product.priceFrom,
          }}
        />

        <div className="flex flex-col gap-5 lg:max-w-[32rem]">
          <div className="flex flex-col gap-1">
            {product.brand ? <p className="text-sm text-foreground-muted">{product.brand}</p> : null}
            <h1 className="text-2xl leading-tight font-semibold tracking-[-0.015em]">{product.name}</h1>
            {product.priceFrom ? (
              <p className="mt-1 text-xl font-semibold">
                {prices.size > 1 ? (
                  <span className="text-[15px] font-normal text-foreground-muted">From </span>
                ) : null}
                <MoneyText value={product.priceFrom} />
              </p>
            ) : null}
          </div>

          <AddToCart variants={product.variants} oneTimeEligible={product.oneTimeEligible} />

          <p className="border-t border-border pt-4 text-[15px] text-foreground-muted">
            Delivery options and your total are shown before you pay.{' '}
            <NextLink
              href="/delivery-returns"
              className="rounded-sm font-medium text-foreground underline underline-offset-4"
            >
              Delivery and returns
            </NextLink>
          </p>

          {product.description ? (
            <div className="border-t border-border pt-4">
              <h2 className="mb-1.5 text-[15px] font-semibold">About this piece</h2>
              <p className="text-[15px] leading-relaxed text-foreground-muted">{product.description}</p>
            </div>
          ) : null}

          {details.length > 0 ? (
            <dl className="flex flex-col gap-2.5 border-t border-border pt-4 text-[15px]">
              {details.map((row) => (
                <div key={row.label} className="grid grid-cols-[7.5rem_1fr] gap-2">
                  <dt className="font-semibold">{row.label}</dt>
                  <dd className="text-foreground-muted">{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </div>

      {more.length > 0 ? (
        <section aria-labelledby="more" className="mt-6 border-t border-border pt-5">
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <h2 id="more" className="text-lg font-semibold">
              More in {product.category.name}
            </h2>
            <NextLink href={categoryHref} className="text-sm font-medium underline underline-offset-4">
              See all
            </NextLink>
          </div>
          <ul className={PRODUCT_GRID}>
            {more.map((item) => (
              <li key={item.id} className="min-w-0">
                <ProductCard product={item} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
