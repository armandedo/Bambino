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

const PILL =
  'inline-flex min-h-12 items-center gap-2.5 rounded-full bg-surface py-1.5 pr-5 pl-2 font-medium tracking-tight text-primary shadow-sm transition-[box-shadow,transform] duration-300 ease-brand hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

const ICON_DISC = 'flex size-9 items-center justify-center rounded-full bg-surface-muted text-primary';

/** One pill per shop category, linking to the shop filtered by it, plus one for everything. */
export function CategoryTiles({ categories }: { categories: CategorySummary[] }) {
  return (
    <ul className="flex flex-wrap gap-3">
      {categories.slice(0, 6).map((category) => {
        const Icon = iconFor(category.slug);
        return (
          <li key={category.id}>
            <NextLink href={`/shop?category=${encodeURIComponent(category.slug)}`} className={PILL}>
              <span className={ICON_DISC}>
                <Icon aria-hidden="true" className="size-[1.1rem]" strokeWidth={1.7} />
              </span>
              {category.name}
            </NextLink>
          </li>
        );
      })}
      <li>
        <NextLink href="/shop" className={PILL}>
          <span className={ICON_DISC}>
            <LayoutGrid aria-hidden="true" className="size-[1.1rem]" strokeWidth={1.7} />
          </span>
          All clothes
        </NextLink>
      </li>
    </ul>
  );
}
