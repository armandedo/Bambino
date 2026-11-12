import { ageGroupBySlug } from '@bambino/config';

/**
 * The five ages families shop by on the storefront. Each one gathers the size codes it covers, so "Kids" finds
 * every size from 5-6Y to 12-13Y in one go. The finer age groups in @bambino/config stay as they are: the size
 * finder and older links such as /shop?age=toddler or /shop?age=age-7 still resolve through them.
 */
export interface ShopAge {
  slug: string;
  label: string;
  ages: string;
  sizeCodes: readonly string[];
  /** A small cut-out garment shown in the age's door on the home page. */
  image: { src: string; width: number; height: number };
}

export const SHOP_AGES: readonly ShopAge[] = [
  {
    slug: 'newborn',
    label: 'Newborn',
    ages: '0 to 3 months',
    sizeCodes: ['0-3M'],
    image: { src: '/images/doors/newborn.webp', width: 172, height: 220 },
  },
  {
    slug: 'baby',
    label: 'Baby',
    ages: '3 to 24 months',
    sizeCodes: ['3-6M', '6-9M', '9-12M', '12-18M', '18-24M'],
    image: { src: '/images/doors/baby.webp', width: 145, height: 220 },
  },
  {
    slug: 'little-kids',
    label: 'Little kids',
    ages: '2 to 4 years',
    sizeCodes: ['2-3Y', '3-4Y', '4-5Y'],
    image: { src: '/images/doors/little-kids.webp', width: 105, height: 220 },
  },
  {
    slug: 'kids',
    label: 'Kids',
    ages: '5 to 12 years',
    sizeCodes: ['5-6Y', '6-7Y', '7-8Y', '8-9Y', '9-10Y', '10-11Y', '11-12Y', '12-13Y'],
    image: { src: '/images/doors/kids.webp', width: 200, height: 207 },
  },
  {
    slug: 'teens',
    label: 'Teens',
    ages: '13 to 17 years',
    sizeCodes: ['13-14Y', '14-15Y', '15-16Y', '16-17Y', '17-18Y'],
    image: { src: '/images/doors/teens.webp', width: 200, height: 189 },
  },
];

export interface ShopAgeMatch {
  slug: string;
  label: string;
  ages: string;
  sizeCodes: readonly string[];
}

/** The age behind an `?age=` value: one of the five above, or a finer group from an older link. */
export function shopAgeBySlug(slug: string | undefined): ShopAgeMatch | undefined {
  if (!slug) return undefined;
  const door = SHOP_AGES.find((age) => age.slug === slug);
  if (door) return door;
  const group = ageGroupBySlug(slug);
  if (!group) return undefined;
  return { slug: group.slug, label: group.label, ages: group.ages, sizeCodes: group.sizeCodes };
}
