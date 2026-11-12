import type { CategorySummary } from '@bambino/api-client';
import NextLink from 'next/link';

const PILL =
  'inline-flex min-h-12 items-center rounded-full border border-border bg-surface px-5 font-medium transition-colors hover:border-primary hover:bg-accent-soft';

/** One pill per shop category, linking to the shop filtered by it. */
export function CategoryTiles({ categories }: { categories: CategorySummary[] }) {
  return (
    <ul className="flex flex-wrap gap-2.5">
      {categories.slice(0, 8).map((category) => (
        <li key={category.id}>
          <NextLink href={`/shop?category=${encodeURIComponent(category.slug)}`} className={PILL}>
            {category.name}
          </NextLink>
        </li>
      ))}
    </ul>
  );
}
