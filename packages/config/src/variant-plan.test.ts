import { describe, expect, it } from 'vitest';
import { parseColors, planVariants } from './variant-plan';

const ALL = ['0-3M', '3-6M', '6-9M', '9-12M', '12-18M', '18-24M'];

describe('parseColors', () => {
  it('splits on commas, semicolons and new lines, tidies spacing and case, and drops repeats', () => {
    expect(parseColors('white,  soft pink; Sky blue\nWHITE')).toEqual(['White', 'Soft pink', 'Sky blue']);
    expect(parseColors('')).toEqual([]);
    expect(parseColors(' , ; ')).toEqual([]);
  });
});

describe('planVariants', () => {
  it('makes one variant per colour and size of the chosen age groups', () => {
    const plan = planVariants({
      slug: 'baby-romper',
      ageSlugs: ['newborn', 'mid-infant'],
      colors: ['White', 'Sky blue'],
      availableSizes: ALL,
    });
    expect(plan).toHaveLength(2 * 3);
    expect(plan.map((v) => v.sizeCode)).toEqual(['0-3M', '6-9M', '9-12M', '0-3M', '6-9M', '9-12M']);
    expect(plan[0]).toEqual({ sku: 'BABY-ROMPER-WHITE-03M', sizeCode: '0-3M', color: 'White' });
    expect(plan[3]?.sku).toBe('BABY-ROMPER-SKYBLUE-03M');
  });

  it('gives every variant a different SKU', () => {
    const plan = planVariants({
      slug: 'x',
      ageSlugs: ['newborn', 'early-infant', 'mid-infant', 'toddler', 'big-toddler'],
      colors: ['White', 'Cream', 'Soft pink'],
      availableSizes: ALL,
    });
    expect(new Set(plan.map((v) => v.sku)).size).toBe(plan.length);
    expect(plan).toHaveLength(3 * 6);
  });

  it('skips sizes that do not exist and unknown groups, and plans nothing without a group or colour', () => {
    expect(
      planVariants({ slug: 'x', ageSlugs: ['toddler'], colors: ['White'], availableSizes: ['0-3M'] }),
    ).toEqual([]);
    expect(planVariants({ slug: 'x', ageSlugs: ['nope'], colors: ['White'], availableSizes: ALL })).toEqual(
      [],
    );
    expect(planVariants({ slug: 'x', ageSlugs: ['newborn'], colors: [], availableSizes: ALL })).toEqual([]);
  });
});
