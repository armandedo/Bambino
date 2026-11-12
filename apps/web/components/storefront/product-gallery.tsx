'use client';

import type { ProductCard } from '@bambino/api-client';
import { cn } from '@bambino/ui';
import { Heart } from 'lucide-react';
import { useState } from 'react';
import { ProductPhoto } from './product-photo';
import { useStorefront } from './storefront-context';

type GalleryProduct = Pick<ProductCard, 'id' | 'slug' | 'name' | 'images' | 'priceFrom'>;
export function ProductGallery({ product }: { product: GalleryProduct }) {
  const [selected, setSelected] = useState(0);
  const { ready, saved, toggleSaved } = useStorefront();
  const image = product.images[selected] ?? product.images[0];
  const isSaved = saved.some((item) => item.id === product.id);
  return (
    <div className="self-start md:sticky md:top-24 lg:top-28">
      <div className="relative aspect-[4/5] overflow-hidden rounded-[22px] border border-border bg-surface">
        <ProductPhoto
          key={image?.url}
          src={image?.url}
          alt={image?.altText || product.name}
          sizes="(min-width: 1440px) 680px, (min-width: 768px) 50vw, 100vw"
          fit="contain"
          priority
        />
        <button
          type="button"
          className="retail-icon-button absolute top-3 right-3 border border-border bg-surface"
          disabled={!ready}
          aria-pressed={isSaved}
          aria-label={`${isSaved ? 'Unsave' : 'Save'} ${product.name}`}
          onClick={() => toggleSaved(product)}
        >
          <Heart
            className={cn('size-5', isSaved && 'count-pop fill-emphasis text-emphasis')}
            strokeWidth={1.8}
            aria-hidden="true"
          />
        </button>
      </div>
      {product.images.length > 1 ? (
        <div className="no-scrollbar mt-3 flex gap-3 overflow-x-auto p-1.5">
          {product.images.map((photo, index) => (
            <button
              key={photo.id}
              type="button"
              aria-label={`View photo ${index + 1} of ${product.name}`}
              aria-pressed={selected === index}
              onClick={() => setSelected(index)}
              className={cn(
                'h-24 w-20 shrink-0 overflow-hidden rounded-xl border-2 bg-surface transition-colors',
                selected === index ? 'border-primary' : 'border-border hover:border-border-strong',
              )}
            >
              <ProductPhoto src={photo.url} alt="" sizes="100px" fit="contain" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
