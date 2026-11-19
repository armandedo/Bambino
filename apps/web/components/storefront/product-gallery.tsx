'use client';

import type { ProductCard } from '@bambino/api-client';
import { cn } from '@bambino/ui';
import { Heart } from 'lucide-react';
import { useState } from 'react';
import { ProductPhoto } from './product-photo';
import { useStorefront } from './storefront-context';

type GalleryProduct = Pick<ProductCard, 'id' | 'slug' | 'name' | 'images' | 'priceFrom'>;

/** The product's photos: one large square, with the others as thumbnails beside it on wide screens. */
export function ProductGallery({ product }: { product: GalleryProduct }) {
  const [selected, setSelected] = useState(0);
  const { ready, saved, toggleSaved } = useStorefront();
  const image = product.images[selected] ?? product.images[0];
  const isSaved = saved.some((item) => item.id === product.id);
  return (
    <div className="flex flex-col gap-2.5 self-start md:sticky md:top-20 lg:flex-row-reverse">
      <div className="relative aspect-square min-w-0 flex-1 overflow-hidden rounded-md border border-border bg-surface">
        <ProductPhoto
          key={image?.url}
          src={image?.url}
          alt={image?.altText || product.name}
          sizes="(min-width: 1440px) 720px, (min-width: 768px) 50vw, 100vw"
          priority
        />
        <button
          type="button"
          className="retail-icon-button absolute top-2 right-2 border border-border bg-surface"
          disabled={!ready}
          aria-pressed={isSaved}
          aria-label={`${isSaved ? 'Unsave' : 'Save'} ${product.name}`}
          onClick={() => toggleSaved(product)}
        >
          <Heart
            key={String(isSaved)}
            className={cn('size-5', isSaved && 'count-pop fill-emphasis text-emphasis')}
            strokeWidth={1.8}
            aria-hidden="true"
          />
        </button>
      </div>
      {product.images.length > 1 ? (
        <div className="no-scrollbar flex gap-2 overflow-x-auto p-1 lg:max-h-[36rem] lg:flex-col lg:overflow-y-auto">
          {product.images.map((photo, index) => (
            <button
              key={photo.id}
              type="button"
              aria-label={`View photo ${index + 1} of ${product.name}`}
              aria-pressed={selected === index}
              onClick={() => setSelected(index)}
              className={cn(
                'size-16 shrink-0 overflow-hidden rounded-md border-2 bg-surface transition-colors',
                selected === index ? 'border-primary' : 'border-border hover:border-border-strong',
              )}
            >
              <ProductPhoto src={photo.url} alt="" sizes="64px" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
