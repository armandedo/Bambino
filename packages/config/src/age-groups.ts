/**
 * The five shopping age groups. A group is a named run of the catalogue's size codes (`sizes.code`), so no
 * product needs a separate "age group" field: a product belongs to every group whose sizes it is sold in.
 * Sizes are guidance only; actual fit varies by garment and by baby.
 */
export interface AgeGroup {
  /** Used in the URL: /shop?age=newborn */
  slug: string;
  label: string;
  /** Shown beside the label. */
  ages: string;
  blurb: string;
  sizeCodes: readonly string[];
}

export const AGE_GROUPS: readonly AgeGroup[] = [
  {
    slug: 'newborn',
    label: 'Newborn',
    ages: '0-3 months',
    blurb: 'Soft first layers, swaddles and sleepwear for the first weeks.',
    sizeCodes: ['0-3M'],
  },
  {
    slug: 'early-infant',
    label: 'Early infant',
    ages: '3-6 months',
    blurb: 'Easy-on pieces for a growing, wriggling baby.',
    sizeCodes: ['3-6M'],
  },
  {
    slug: 'mid-infant',
    label: 'Mid infant',
    ages: '6-12 months',
    blurb: 'Rompers, tops and first-mover clothes for sitting, crawling and standing.',
    sizeCodes: ['6-9M', '9-12M'],
  },
  {
    slug: 'toddler',
    label: 'Toddler',
    ages: '12-18 months',
    blurb: 'Everyday outfits that cope with first steps.',
    sizeCodes: ['12-18M'],
  },
  {
    slug: 'big-toddler',
    label: 'Big toddler',
    ages: '18-24 months',
    blurb: 'Playtime clothes and outerwear for little explorers.',
    sizeCodes: ['18-24M'],
  },
];

export function ageGroupBySlug(slug: string | undefined | null): AgeGroup | undefined {
  return AGE_GROUPS.find((group) => group.slug === slug);
}

/** The age group a size code belongs to, if any. */
export function ageGroupForSize(sizeCode: string): AgeGroup | undefined {
  return AGE_GROUPS.find((group) => group.sizeCodes.includes(sizeCode));
}
