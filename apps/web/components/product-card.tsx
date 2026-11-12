'use client';

import type { ProductCard as ProductCardData } from '@bambino/api-client';
import { MoneyText } from '@bambino/ui';
import { Heart } from 'lucide-react';
import NextLink from 'next/link';
import { ProductPhoto } from './storefront/product-photo';
import { useStorefront } from './storefront/storefront-context';

export function ProductCard({ product, level = 3 }: { product: ProductCardData; level?: 2 | 3 }) {
  const Heading = `h${level}` as const;
  const { ready, saved, toggleSaved } = useStorefront();
  const isSaved = saved.some((item) => item.id === product.id);
  const sizeMap = new Map<string, ProductCardData['variants'][number]>();
  for (const variant of product.variants) {
    if (!sizeMap.has(variant.size.code) || variant.inStock) sizeMap.set(variant.size.code, variant);
  }
  const sizes = [...sizeMap.values()].sort((a, b) => a.size.sortOrder - b.size.sortOrder);
  const inStock = product.variants.some((variant) => variant.inStock);
  const image = product.images[0];
  return (
    <article className="retail-product-card group relative flex w-full min-w-0 flex-col overflow-hidden rounded-[1.5rem] bg-surface p-2">
      <div className="relative aspect-[4/5] overflow-hidden rounded-[15px] bg-white">
        <NextLink
          href={`/shop/${product.slug}`}
          aria-label={`View ${product.name}`}
          className="block h-full focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-focus"
        >
          <ProductPhoto fit="contain" src={image?.url} alt={image?.altText ?? product.name} />
          {product.images[1] ? (
            <div className="absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100 motion-reduce:transition-none">
              <ProductPhoto fit="contain" src={product.images[1].url} alt="" />
            </div>
          ) : null}
        </NextLink>
        {!inStock ? (
          <span className="absolute top-3 left-3 rounded-full bg-white px-3 py-1 text-xs font-semibold">
            Sold out
          </span>
        ) : null}
        <button
          type="button"
          className="retail-save-button absolute top-2.5 right-2.5 z-10 flex size-10 items-center justify-center rounded-full bg-white/95 shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          disabled={!ready}
          onClick={() => toggleSaved(product)}
          aria-pressed={isSaved}
          aria-label={`${isSaved ? 'Unsave' : 'Save'} ${product.name}`}
        >
          <Heart
            className={`size-5 ${isSaved ? 'fill-emphasis text-emphasis' : 'text-primary'}`}
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </button>
        <NextLink
          href={`/shop/${product.slug}`}
          className="retail-quick-shop absolute inset-x-3 bottom-3 rounded-xl bg-white/95 px-3 py-3 text-center text-sm font-semibold shadow-sm"
        >
          {inStock ? 'Choose a size' : 'View this piece'}
        </NextLink>
      </div>
      <div className="flex flex-1 flex-col px-3 pt-3 pb-4">
        <p className="text-sm text-foreground-muted">{product.category.name}</p>
        <Heading className="mt-1.5 min-h-[2.8em] font-display text-lg leading-snug font-medium tracking-tight">
          <NextLink
            href={`/shop/${product.slug}`}
            className="hover:underline hover:underline-offset-4 focus-visible:outline-2 focus-visible:outline-focus"
          >
            {product.name}
          </NextLink>
        </Heading>
        <p className="mt-2 text-base font-bold">
          {product.priceFrom ? (
            <>
              <span className="text-sm font-normal">From </span>
              <MoneyText value={product.priceFrom} />
            </>
          ) : (
            <span className="font-normal text-foreground-muted">Price on request</span>
          )}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Sizes">
          {sizes.slice(0, 4).map((variant) => (
            <span
              key={variant.size.code}
              className={`rounded-md border border-border px-1.5 py-1 text-xs ${variant.inStock ? 'bg-white text-foreground-muted' : 'text-foreground-muted/60 line-through'}`}
            >
              {variant.size.code}
            </span>
          ))}
          {sizes.length > 4 ? (
            <span className="py-1 text-xs text-foreground-muted">+{sizes.length - 4}</span>
          ) : null}
        </div>
      </div>
    </article>
  );
}
