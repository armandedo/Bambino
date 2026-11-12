import NextLink from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { ProductPhoto } from './product-photo';

export function PromoTile({
  title,
  description,
  href,
  image,
  alt,
  tone = 'peach',
  className = '',
}: {
  title: string;
  description: string;
  href: string;
  image?: string | undefined;
  alt: string;
  tone?: 'peach' | 'cream' | 'sand';
  className?: string;
}) {
  const backgrounds = { peach: 'bg-[#f5ded2]', cream: 'bg-[#f1ece1]', sand: 'bg-[#ede9e4]' };
  return (
    <NextLink
      href={href}
      className={`group relative grid min-h-56 grid-cols-[1.1fr_1fr] overflow-hidden rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus ${backgrounds[tone]} ${className}`}
    >
      <div className="relative z-10 flex flex-col items-start p-6 xl:p-7">
        <span className="max-w-[10ch] font-display text-2xl leading-tight font-bold tracking-[-.04em] xl:text-[1.75rem]">
          {title}
        </span>
        <span className="mt-3 max-w-[18ch] text-base text-foreground-muted">{description}</span>
        <span className="mt-auto pt-5 text-sm font-bold underline underline-offset-4">
          Explore <ArrowUpRight className="ml-1 inline size-4" aria-hidden="true" />
        </span>
      </div>
      <div className="relative -ml-3 h-full overflow-hidden mix-blend-multiply">
        <ProductPhoto src={image} alt={alt} sizes="(min-width: 1024px) 220px, 45vw" />
      </div>
    </NextLink>
  );
}
