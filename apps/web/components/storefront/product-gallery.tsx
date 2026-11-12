'use client';

import type { ProductCard } from '@bambino/api-client';
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
    <div className="self-start lg:sticky lg:top-44">
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-border bg-white">
        <ProductPhoto
          key={image?.url}
          src={image?.url}
          alt={image?.altText || product.name}
          sizes="(min-width: 1328px) 580px, (min-width: 768px) 50vw, 100vw"
          fit="contain"
          priority
        />
        <button
          type="button"
          className="retail-icon-button absolute top-4 right-4 bg-white shadow-sm"
          disabled={!ready}
          aria-pressed={isSaved}
          aria-label={`${isSaved ? 'Unsave' : 'Save'} ${product.name}`}
          onClick={() => toggleSaved(product)}
        >
          <Heart className={`size-5 ${isSaved ? 'fill-[#a64732] text-[#a64732]' : ''}`} aria-hidden="true" />
        </button>
      </div>
      {product.images.length > 1 ? (
        <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
          {product.images.map((photo, index) => (
            <button
              key={photo.id}
              type="button"
              aria-label={`View photo ${index + 1} of ${product.name}`}
              aria-pressed={selected === index}
              onClick={() => setSelected(index)}
              className={`h-24 w-20 shrink-0 overflow-hidden rounded-xl border-2 ${selected === index ? 'border-primary' : 'border-transparent'}`}
            >
              <ProductPhoto src={photo.url} alt="" sizes="100px" fit="contain" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
