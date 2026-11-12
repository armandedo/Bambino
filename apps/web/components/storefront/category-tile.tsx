import NextLink from 'next/link';
import { ProductPhoto } from './product-photo';

export function CategoryTile({
  label,
  href,
  image,
}: {
  label: string;
  href: string;
  image?: string | undefined;
}) {
  return (
    <NextLink
      href={href}
      className="group block rounded-2xl text-center focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
    >
      <div className="mb-4 aspect-square overflow-hidden rounded-full border border-border bg-surface-muted p-2">
        <div className="h-full overflow-hidden rounded-full">
          <ProductPhoto src={image} alt={label} sizes="(min-width: 1024px) 170px, 130px" />
        </div>
      </div>
      <span className="text-base font-semibold group-hover:underline group-hover:underline-offset-4">
        {label}
      </span>
    </NextLink>
  );
}
