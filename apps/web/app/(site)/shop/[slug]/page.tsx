import { ProductQuery } from '@bambino/api-client';
import { MoneyText } from '@bambino/ui';
import type { Metadata } from 'next';
import NextLink from 'next/link';
import { notFound } from 'next/navigation';
import { AddToCart } from '@/components/add-to-cart';
import { ApiErrorState } from '@/components/api-error';
import { ProductGallery } from '@/components/storefront/product-gallery';
import { load } from '@/lib/api';

type Params = Promise<{ slug: string }>;

const CRUMB = 'rounded-sm underline underline-offset-4 hover:text-foreground';

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
      <div className="retail-container py-12">
        <ApiErrorState error={result.error} what="this product" />
      </div>
    );
  }
  const product = result.data.product;
  if (!product) notFound();

  const details = [
    { label: 'Material', value: product.material },
    { label: 'Care', value: product.careInstructions },
    { label: 'Sustainability', value: product.sustainabilityInfo },
  ].filter((row): row is { label: string; value: string } => Boolean(row.value?.trim()));

  return (
    <div className="retail-container flex flex-col gap-5 pt-5 pb-14 md:gap-7 md:pt-8 lg:pb-20">
      <nav aria-label="Breadcrumb" className="text-[15px] text-foreground-muted">
        <ol className="flex flex-wrap items-center gap-x-2">
          <li>
            <NextLink href="/shop" className={CRUMB}>
              Shop
            </NextLink>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <NextLink href={`/shop?category=${encodeURIComponent(product.category.slug)}`} className={CRUMB}>
              {product.category.name}
            </NextLink>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-foreground">
            {product.name}
          </li>
        </ol>
      </nav>

      <div className="grid gap-7 md:grid-cols-2 md:gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-20">
        <ProductGallery
          product={{
            id: product.id,
            slug: product.slug,
            name: product.name,
            images: product.images,
            priceFrom: product.priceFrom,
          }}
        />

        <div className="flex flex-col gap-6 lg:max-w-[34rem] lg:pt-2">
          <div className="flex flex-col gap-2">
            {product.brand ? <p className="text-[15px] text-foreground-muted">{product.brand}</p> : null}
            <h1 className="text-[clamp(1.875rem,3.6vw,2.75rem)] leading-[1.08] font-semibold tracking-[-0.04em]">
              {product.name}
            </h1>
            {product.priceFrom ? (
              <p className="mt-1 text-2xl font-semibold">
                <MoneyText value={product.priceFrom} />
              </p>
            ) : null}
          </div>

          {product.description ? (
            <p className="leading-relaxed text-foreground-muted">{product.description}</p>
          ) : null}

          <AddToCart variants={product.variants} oneTimeEligible={product.oneTimeEligible} />

          <p className="border-t border-border pt-5 text-[15px] text-foreground-muted">
            Delivery options and your total are shown before you pay.{' '}
            <NextLink
              href="/how-it-works"
              className="rounded-sm font-medium text-foreground underline underline-offset-4"
            >
              Shopping and delivery
            </NextLink>
          </p>

          {details.length > 0 ? (
            <dl className="flex flex-col gap-3 border-t border-border pt-5 text-[15px]">
              {details.map((row) => (
                <div key={row.label} className="grid grid-cols-[8rem_1fr] gap-2">
                  <dt className="font-semibold">{row.label}</dt>
                  <dd className="text-foreground-muted">{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </div>
    </div>
  );
}
