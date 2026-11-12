/**
 * The shopping age groups. A group is a named run of the catalogue's size codes (`sizes.code`), so no
 * product needs a separate "age group" field: a product belongs to every group whose sizes it is sold in.
 * Sizes are guidance only; actual fit varies by garment and by child.
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
  {
    slug: 'preschool',
    label: 'Preschool',
    ages: '2-4 years',
    blurb: 'Everyday clothes for growing children.',
    sizeCodes: ['2-3Y', '3-4Y', '4-5Y'],
  },
  {
    slug: 'kids',
    label: 'Kids',
    ages: '5-8 years',
    blurb: 'Everyday clothes for growing children.',
    sizeCodes: ['5-6Y', '6-7Y', '7-8Y', '8-9Y'],
  },
  {
    slug: 'older-kids',
    label: 'Older kids',
    ages: '9-12 years',
    blurb: 'Everyday clothes for growing children.',
    sizeCodes: ['9-10Y', '10-11Y', '11-12Y', '12-13Y'],
  },
  {
    slug: 'teens',
    label: 'Teens',
    ages: '13-17 years',
    blurb: 'Everyday clothes for growing children.',
    sizeCodes: ['13-14Y', '14-15Y', '15-16Y', '16-17Y', '17-18Y'],
  },
];

export function ageGroupBySlug(slug: string | undefined | null): AgeGroup | undefined {
  const group = AGE_GROUPS.find((group) => group.slug === slug);
  if (group) return group;
  const age = /^age-(\d+)$/.exec(slug ?? '');
  const years = age ? Number(age[1]) : -1;
  if (years < 2 || years > 17) return undefined;
  return {
    slug: `age-${years}`,
    label: `${years} years`,
    ages: `${years}-${years + 1} years`,
    blurb: 'Everyday clothes for growing children.',
    sizeCodes: [`${years}-${years + 1}Y`],
  };
}

/** The age group a size code belongs to, if any. */
export function ageGroupForSize(sizeCode: string): AgeGroup | undefined {
  return AGE_GROUPS.find((group) => group.sizeCodes.includes(sizeCode));
}
