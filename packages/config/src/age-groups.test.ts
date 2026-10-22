import { describe, expect, it } from 'vitest';
import { AGE_GROUPS, ageGroupBySlug, ageGroupForSize } from './age-groups';

describe('age groups', () => {
  it('covers 0 to 24 months with no size in two groups', () => {
    const sizes = AGE_GROUPS.flatMap((group) => group.sizeCodes);
    expect(sizes).toEqual(['0-3M', '3-6M', '6-9M', '9-12M', '12-18M', '18-24M']);
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
    expect(ageGroupForSize('24-36M')).toBeUndefined();
  });
});
