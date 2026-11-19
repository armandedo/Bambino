import { describe, expect, it } from 'vitest';
import { AGE_GROUPS, ageGroupBySlug, ageGroupForSize } from './age-groups';

describe('age groups', () => {
  it('covers newborn through age 17 with no size in two groups', () => {
    const sizes = AGE_GROUPS.flatMap((group) => group.sizeCodes);
    expect(sizes).toEqual([
      '0-3M',
      '3-6M',
      '6-9M',
      '9-12M',
      '12-18M',
      '18-24M',
      ...Array.from({ length: 16 }, (_, i) => `${i + 2}-${i + 3}Y`),
    ]);
    expect(new Set(sizes).size).toBe(sizes.length);
  });

  it('has unique, URL-safe slugs', () => {
    const slugs = AGE_GROUPS.map((group) => group.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it('finds a group by slug or by one of its sizes', () => {
    expect(ageGroupBySlug('mid-infant')?.sizeCodes).toEqual(['6-9M', '9-12M']);
    expect(ageGroupBySlug('nope')).toBeUndefined();
    expect(ageGroupForSize('9-12M')?.slug).toBe('mid-infant');
    expect(ageGroupForSize('17-18Y')?.slug).toBe('teens');
    expect(ageGroupForSize('24-36M')).toBeUndefined();
  });

  it('supports individual year filters through 17 without extending beyond the range', () => {
    expect(ageGroupBySlug('age-2')?.sizeCodes).toEqual(['2-3Y']);
    expect(ageGroupBySlug('age-17')?.sizeCodes).toEqual(['17-18Y']);
    expect(ageGroupBySlug('age-18')).toBeUndefined();
  });
});
