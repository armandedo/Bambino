'use client';

import type { ProductCard as ProductCardData } from '@bambino/api-client';
import { MoneyText, buttonClasses, cn } from '@bambino/ui';
import { Heart } from 'lucide-react';
import NextLink from 'next/link';
import { useAddToBag } from '@/components/add-to-cart';
import { useSession } from '@/lib/session';
import { ProductPhoto } from './storefront/product-photo';
import { useStorefront } from './storefront/storefront-context';

const ACTION = 'mt-1.5 min-h-10 text-sm font-semibold';

/**
 * One product in the grid: photo, name, price and one action. A product with a single size goes straight in the
 * bag; anything with a choice to make opens the options panel, so the shopper stays on the grid.
 */
export function ProductCard({ product, priority = false }: { product: ProductCardData; priority?: boolean }) {
  const { viewer } = useSession();
  const { saved, toggleSaved, openOptions } = useStorefront();
  const add = useAddToBag();
  const isSaved = saved.some((item) => item.id === product.id);
  const inStock = product.variants.filter((variant) => variant.inStock);
  const single = product.variants.length === 1 ? inStock[0] : undefined;
  const prices = new Set(product.variants.map((variant) => variant.price.amount));
  const href = `/shop/${product.slug}`;
  const image = product.images[0];

  return (
    <article className="group relative flex min-w-0 flex-col">
      <div className="relative aspect-square overflow-hidden rounded-md border border-border bg-surface">
        <NextLink href={href} tabIndex={-1} aria-hidden="true" className="block h-full">
          <ProductPhoto
            src={image?.url}
            alt={image?.altText || product.name}
            priority={priority}
            className="transition-transform duration-300 group-hover:scale-[1.03]"
          />
        </NextLink>
        {inStock.length === 0 ? (
          <span className="absolute top-2 left-2 rounded-sm bg-primary px-1.5 py-0.5 text-xs font-semibold text-primary-foreground">
            Sold out
          </span>
        ) : null}
        <button
          type="button"
          aria-pressed={isSaved}
          aria-label={`${isSaved ? 'Unsave' : 'Save'} ${product.name}`}
          onClick={() => toggleSaved(product)}
          className="absolute top-1 right-1 flex size-10 items-center justify-center rounded-full bg-surface/85 text-foreground hover:bg-surface"
        >
          <Heart
            key={String(isSaved)}
            aria-hidden="true"
            strokeWidth={1.8}
            className={cn('size-5', isSaved && 'count-pop fill-emphasis text-emphasis')}
          />
        </button>
      </div>
      <h3 className="mt-2 truncate text-sm leading-snug">
        <NextLink href={href} className="rounded-sm hover:underline">
          {product.name}
        </NextLink>
      </h3>
      {product.priceFrom ? (
        <p className="mt-0.5 font-semibold">
          {prices.size > 1 ? <span className="text-sm font-normal text-foreground-muted">From </span> : null}
          <MoneyText value={product.priceFrom} />
        </p>
      ) : null}
      {inStock.length === 0 ? (
        <NextLink
          href={href}
          className={buttonClasses({ variant: 'outline', size: 'sm', fullWidth: true, className: ACTION })}
        >
          View details<span className="sr-only">: {product.name}</span>
        </NextLink>
      ) : (
        <button
          type="button"
          disabled={add.isPending}
          onClick={() => (single && viewer ? add.mutate(single.id) : openOptions(product))}
          className={buttonClasses({ variant: 'outline', size: 'sm', fullWidth: true, className: ACTION })}
        >
          {single ? (add.isPending ? 'Adding…' : 'Add to bag') : 'Choose options'}
          <span className="sr-only">: {product.name}</span>
        </button>
      )}
    </article>
  );
}
