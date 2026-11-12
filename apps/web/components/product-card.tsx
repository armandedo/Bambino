'use client';

import type { ProductCard as ProductCardData } from '@bambino/api-client';
import { MoneyText } from '@bambino/ui';
import { Heart } from 'lucide-react';
import NextLink from 'next/link';
import { ProductPhoto } from './storefront/product-photo';
import { useStorefront } from './storefront/storefront-context';

const CHIP = 'rounded-md border border-border bg-surface px-1.5 py-0.5 text-[13px] text-foreground-muted';

export function ProductCard({ product, level = 3 }: { product: ProductCardData; level?: 2 | 3 }) {
  const Heading = `h${level}` as const;
  const { ready, saved, toggleSaved } = useStorefront();
  const isSaved = saved.some((item) => item.id === product.id);
  // Only the sizes a family can buy today, smallest first.
  const sizeCodes = new Map<string, number>();
  for (const variant of product.variants) {
    if (variant.inStock) sizeCodes.set(variant.size.code, variant.size.sortOrder);
  }
  const sizes = [...sizeCodes.entries()].sort((a, b) => a[1] - b[1]).map(([code]) => code);
  const image = product.images[0];
  return (
    <article className="relative flex w-full min-w-0 flex-col">
      <div className="relative">
        <NextLink
          href={`/shop/${product.slug}`}
          aria-label={`View ${product.name}`}
          tabIndex={-1}
          className="group/photo block aspect-[4/5] overflow-hidden rounded-[18px] border border-border bg-surface"
        >
          <ProductPhoto fit="contain" src={image?.url} alt={image?.altText ?? product.name} />
        </NextLink>
        <button
          type="button"
          className="retail-icon-button absolute top-2 right-2 bg-surface/90"
          disabled={!ready}
          onClick={() => toggleSaved(product)}
          aria-pressed={isSaved}
          aria-label={`${isSaved ? 'Unsave' : 'Save'} ${product.name}`}
        >
          <Heart
            className={`size-5 ${isSaved ? 'count-pop fill-emphasis text-emphasis' : ''}`}
            strokeWidth={1.8}
            aria-hidden="true"
          />
        </button>
      </div>
      <div className="flex flex-1 flex-col px-1 pt-3">
        <Heading className="leading-snug font-semibold">
          <NextLink
            href={`/shop/${product.slug}`}
            className="rounded-sm hover:underline hover:underline-offset-4"
          >
            {product.name}
          </NextLink>
        </Heading>
        <p className="mt-1 text-[15px] text-foreground-muted">
          {product.priceFrom ? (
            <>
              From <MoneyText value={product.priceFrom} />
            </>
          ) : (
            'Price on request'
          )}
        </p>
        <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Sizes in stock">
          {sizes.length === 0 ? (
            <li className={CHIP}>Sold out</li>
          ) : (
            <>
              {sizes.slice(0, 4).map((code) => (
                <li key={code} className={CHIP}>
                  {code}
                </li>
              ))}
              {sizes.length > 4 ? (
                <li className="py-0.5 text-[13px] text-foreground-muted">
                  +{sizes.length - 4}
                  <span className="sr-only"> more</span>
                </li>
              ) : null}
            </>
          )}
        </ul>
      </div>
    </article>
  );
}
