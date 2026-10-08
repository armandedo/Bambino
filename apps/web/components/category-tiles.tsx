import type { CategorySummary } from '@bambino/api-client';
import { Baby, Footprints, LayoutGrid, Shirt, Sparkles, Snowflake, type LucideIcon } from 'lucide-react';
import NextLink from 'next/link';

/** An icon per category, matched on the slug; anything new falls back to a shirt. */
const ICONS: [RegExp, LucideIcon][] = [
  [/body|romper|sleep|onesie/, Baby],
  [/sock|shoe|boot|foot/, Footprints],
  [/jacket|coat|knit|sweater|warm/, Snowflake],
  [/set|gift|special|outfit/, Sparkles],
];

function iconFor(slug: string): LucideIcon {
  return ICONS.find(([pattern]) => pattern.test(slug))?.[1] ?? Shirt;
}

const TILE =
  'group flex flex-col items-center gap-3 rounded-xl bg-surface-muted px-3 py-5 text-center transition-colors hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-focus';

/** One tile per shop category, linking to the shop filtered by it, plus a tile for everything. */
export function CategoryTiles({ categories }: { categories: CategorySummary[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {categories.slice(0, 5).map((category) => {
        const Icon = iconFor(category.slug);
        return (
          <li key={category.id} className="flex">
            <NextLink
              href={`/shop?category=${encodeURIComponent(category.slug)}`}
              className={`${TILE} w-full`}
            >
              <span className="flex size-14 items-center justify-center rounded-full bg-surface text-primary shadow-xs">
                <Icon aria-hidden="true" className="size-7" strokeWidth={1.6} />
              </span>
              <span className="font-semibold text-primary">{category.name}</span>
            </NextLink>
          </li>
        );
      })}
      <li className="flex">
        <NextLink href="/shop" className={`${TILE} w-full`}>
          <span className="flex size-14 items-center justify-center rounded-full bg-surface text-primary shadow-xs">
            <LayoutGrid aria-hidden="true" className="size-7" strokeWidth={1.6} />
          </span>
          <span className="font-semibold text-primary">All clothes</span>
        </NextLink>
      </li>
    </ul>
  );
}
