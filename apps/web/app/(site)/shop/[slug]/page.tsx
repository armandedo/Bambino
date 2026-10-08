import { ProductQuery } from '@bambino/api-client';
import { Badge, Card, MoneyText } from '@bambino/ui';
import type { Metadata } from 'next';
import NextLink from 'next/link';
import { notFound } from 'next/navigation';
import { AddToCart } from '@/components/add-to-cart';
import { ApiErrorState } from '@/components/api-error';
import { ProductArt } from '@/components/product-art';
import { load } from '@/lib/api';

export const revalidate = 60;

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

  const image = product.images[0];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
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

      <div className="grid gap-10 md:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-border">
          {image ? (
            // Plain img: product photos come from object storage, and next/image needs its domain configured first.
            <img src={image.url} alt={image.altText} className="aspect-square w-full object-cover" />
          ) : (
            <ProductArt seed={product.slug} className="aspect-square" />
          )}
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-primary">{product.brand}</p>
            <h1 className="font-display text-3xl font-semibold sm:text-4xl">{product.name}</h1>
            {product.priceFrom ? (
              <p className="text-2xl font-semibold">
                <MoneyText value={product.priceFrom} />
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {product.subscriptionEligible ? <Badge tone="brand">Included in subscriptions</Badge> : null}
              {product.oneTimeEligible ? <Badge>Buy once</Badge> : null}
            </div>
          </div>

          <p className="text-foreground-muted">{product.description}</p>

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

          <section aria-labelledby="lifecycle" className="flex flex-col gap-3">
            <h2 id="lifecycle" className="font-display text-lg font-bold text-primary">
              This piece’s life
            </h2>
            <ol className="flex flex-wrap items-center gap-2 text-sm">
              {['Produced', 'Worn', 'Returned', 'Refurbished', 'Redistributed or recycled'].map(
                (stage, index, all) => (
                  <li key={stage} className="flex items-center gap-2">
                    <span className="rounded-full bg-surface-muted px-3 py-1 font-medium">{stage}</span>
                    {index < all.length - 1 ? (
                      <span aria-hidden="true" className="text-foreground-muted">
                        →
                      </span>
                    ) : null}
                  </li>
                ),
              )}
            </ol>
            <p className="text-sm text-foreground-muted">
              Every piece is tagged, inspected when it comes back, and only reused if it passes.
            </p>
          </section>

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
