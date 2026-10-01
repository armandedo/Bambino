import type { ProductCard as ProductCardData } from '@bambino/api-client';
import { Badge, Card, MoneyText } from '@bambino/ui';
import NextLink from 'next/link';
import { ProductArt } from './product-art';

export function ProductCard({ product, level = 3 }: { product: ProductCardData; level?: 2 | 3 }) {
  const Heading = `h${level}` as const;
  const sizes = [...new Map(product.variants.map((v) => [v.size.code, v])).values()].sort(
    (a, b) => a.size.sortOrder - b.size.sortOrder,
  );
  const anyInStock = product.variants.some((variant) => variant.inStock);
  const image = product.images[0];

  return (
    <Card as="article" padding="none" interactive className="group relative flex flex-col overflow-hidden">
      {image ? (
        // Plain img: product photos come from object storage, and next/image needs its domain configured first.
        <img src={image.url} alt={image.altText} className="aspect-[4/5] w-full object-cover" />
      ) : (
        <ProductArt seed={product.slug} className="aspect-[4/5]" />
      )}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-sm text-foreground-muted">{product.category.name}</p>
        <Heading className="font-display text-lg leading-snug font-bold">
          <NextLink
            href={`/shop/${product.slug}`}
            className="after:absolute after:inset-0 focus-visible:outline-none group-focus-within:underline"
          >
            {product.name}
          </NextLink>
        </Heading>
        <p className="text-sm text-foreground-muted">
          {sizes.length > 0 ? `${sizes[0]?.size.code} – ${sizes.at(-1)?.size.code}` : 'No sizes yet'}
        </p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          {product.priceFrom ? (
            <span className="font-semibold">
              <span className="sr-only">Price </span>from <MoneyText value={product.priceFrom} />
            </span>
          ) : (
            <span className="text-foreground-muted">Price on request</span>
          )}
          <div className="flex gap-1">
            {product.subscriptionEligible ? <Badge tone="brand">Subscription</Badge> : null}
            {!anyInStock ? <Badge>Sold out</Badge> : null}
          </div>
        </div>
      </div>
    </Card>
  );
}
