import { ProductQuery } from '@bambino/api-client';
import { Card, MoneyText } from '@bambino/ui';
import type { Metadata } from 'next';
import NextLink from 'next/link';
import { notFound } from 'next/navigation';
import { AddToCart } from '@/components/add-to-cart';
import { ApiErrorState } from '@/components/api-error';
import { ProductGallery } from '@/components/storefront/product-gallery';
import { load } from '@/lib/api';


type Params = Promise<{ slug: string }>;

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
      <div className="mx-auto max-w-6xl px-4 py-12">
        <ApiErrorState error={result.error} what="this product" />
      </div>
    );
  }
  const product = result.data.product;
  if (!product) notFound();

  return (
    <div className="retail-container flex flex-col gap-6 pt-7 pb-28 sm:pt-10 lg:pb-16">
      <nav aria-label="Breadcrumb" className="text-sm">
        <ol className="flex flex-wrap gap-2 text-foreground-muted">
          <li>
            <NextLink href="/shop" className="text-link underline underline-offset-4 hover:decoration-2">
              Shop
            </NextLink>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <NextLink
              href={`/shop?category=${product.category.slug}`}
              className="text-link underline underline-offset-4 hover:decoration-2"
            >
              {product.category.name}
            </NextLink>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-foreground">
            {product.name}
          </li>
        </ol>
      </nav>

      <div className="grid gap-8 md:grid-cols-2 lg:gap-16">
        <ProductGallery
          product={{
            id: product.id,
            slug: product.slug,
            name: product.name,
            images: product.images,
            priceFrom: product.priceFrom,
          }}
        />

        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-primary">{product.brand}</p>
            <h1 className="font-display text-3xl font-bold tracking-[-.045em] sm:text-4xl">{product.name}</h1>
            {product.priceFrom ? (
              <p className="text-2xl font-bold">
                <MoneyText value={product.priceFrom} />
              </p>
            ) : null}
          </div>

          <p className="text-base leading-relaxed text-foreground-muted">{product.description}</p>
          <p className="border-y border-border py-4 text-sm text-foreground-muted">
            Delivery options and your total are shown before you pay.{' '}
            <NextLink href="/how-it-works" className="font-semibold underline underline-offset-4">
              Shopping & delivery
            </NextLink>
          </p>

          <AddToCart variants={product.variants} oneTimeEligible={product.oneTimeEligible} />

          <NextLink
            href="/fit"
            className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-brand-50 p-4 hover:border-brand-300 focus-visible:outline-2 focus-visible:outline-focus"
          >
            <span>
              <span className="block font-semibold text-primary">Not sure which size?</span>
              <span className="text-sm text-foreground-muted">
                Get a recommendation from your baby’s measurements.
              </span>
            </span>
            <span aria-hidden="true" className="text-xl text-primary">
              →
            </span>
          </NextLink>

          <Card padding="sm">
            <dl className="flex flex-col gap-3 text-sm">
              <Detail label="Material" value={product.material} />
              <Detail label="Care" value={product.careInstructions} />
              <Detail label="Sustainability" value={product.sustainabilityInfo} />
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2">
      <dt className="font-semibold">{label}</dt>
      <dd className="text-foreground-muted">{value ?? 'Not provided yet'}</dd>
    </div>
  );
}
