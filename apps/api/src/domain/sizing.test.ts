import { describe, expect, it } from 'vitest';
import { RulesBasedSizingProvider, type SizeRange, type SizingInput } from './sizing';

const sizes: SizeRange[] = [
  {
    code: '0-3M',
    sortOrder: 2,
    minAgeDays: 0,
    maxAgeDays: 91,
    minHeightMm: 500,
    maxHeightMm: 620,
    minWeightG: 3_500,
    maxWeightG: 6_500,
  },
  {
    code: 'NB',
    sortOrder: 1,
    minAgeDays: 0,
    maxAgeDays: 30,
    minHeightMm: 0,
    maxHeightMm: 560,
    minWeightG: 0,
    maxWeightG: 4_500,
  },
  {
    code: '3-6M',
    sortOrder: 3,
    minAgeDays: 91,
    maxAgeDays: 182,
    minHeightMm: 610,
    maxHeightMm: 680,
    minWeightG: 6_000,
    maxWeightG: 8_000,
  },
  {
    code: '6-9M',
    sortOrder: 4,
    minAgeDays: 182,
    maxAgeDays: 274,
    minHeightMm: 670,
    maxHeightMm: 720,
    minWeightG: 7_500,
    maxWeightG: 9_500,
  },
];

const base: SizingInput = {
  ageDays: 120,
  heightMm: 640,
  weightG: 7_000,
  measurementAgeDays: 2,
  fitPreference: 'REGULAR',
  heightHistory: [],
  fitHistory: {},
};

const engine = new RulesBasedSizingProvider();
const recommend = (overrides: Partial<SizingInput> = {}) =>
  engine.recommend({ ...base, ...overrides }, sizes);
const keys = (result: ReturnType<typeof recommend>) => result.reasons.map((reason) => reason.key);

describe('rules-based sizing', () => {
  it('is confident when height and weight point to the same size, and names the next size', () => {
    const result = recommend();
    expect(result).toMatchObject({ sizeCode: '3-6M', nextSizeCode: '6-9M', confidenceBasisPoints: 9_000 });
    expect(keys(result)).toEqual(['sizing.reason.height_and_weight_agree', 'sizing.reason.next_size']);
  });

  it('takes the larger size when measurements disagree, with lower confidence', () => {
    const result = recommend({ heightMm: 700 });
    expect(result).toMatchObject({ sizeCode: '6-9M', confidenceBasisPoints: 7_000 });
    expect(result.reasons[0]).toEqual({
      key: 'sizing.reason.measurements_disagree',
      params: { byHeight: '6-9M', byWeight: '3-6M' },
    });
  });

  it('falls back to one measurement, then to age alone', () => {
    expect(recommend({ weightG: null })).toMatchObject({ sizeCode: '3-6M', confidenceBasisPoints: 7_500 });
    const ageOnly = recommend({ heightMm: null, weightG: null, measurementAgeDays: null, ageDays: 200 });
    expect(ageOnly).toMatchObject({ sizeCode: '6-9M', confidenceBasisPoints: 5_000, nextSizeCode: null });
    expect(keys(ageOnly)).toEqual(['sizing.reason.age_only']);
  });

  it('lowers confidence for old measurements', () => {
    const result = recommend({ measurementAgeDays: 45 });
    expect(result.confidenceBasisPoints).toBe(8_000);
    expect(keys(result)).toContain('sizing.reason.measurement_stale');
  });

  it('moves a ROOMY baby near the top of a range up one size, but not one in the middle', () => {
    expect(recommend({ fitPreference: 'ROOMY', heightMm: 670, weightG: 7_900 }).sizeCode).toBe('6-9M');
    expect(recommend({ fitPreference: 'ROOMY', heightMm: 640, weightG: 7_000 }).sizeCode).toBe('3-6M');
  });

  it('learns from repeated fit reports', () => {
    expect(recommend({ fitHistory: { '3-6M': { tooSmall: 2, tooLarge: 0 } } })).toMatchObject({
      sizeCode: '6-9M',
    });
    expect(recommend({ fitHistory: { '3-6M': { tooSmall: 1, tooLarge: 0 } } })).toMatchObject({
      sizeCode: '3-6M',
    });
    expect(recommend({ fitHistory: { '3-6M': { tooSmall: 0, tooLarge: 3 } } })).toMatchObject({
      sizeCode: '0-3M',
    });
  });

  it('estimates when the next size is needed from growth between readings', () => {
    // Grew 20 mm in 40 days (0.5 mm/day); 40 mm left in 3-6M (680 - 640) -> about 80 days.
    const result = recommend({ heightHistory: [{ heightMm: 620, daysAgo: 42 }] });
    expect(result.reasons.at(-1)).toEqual({
      key: 'sizing.reason.next_size_in_days',
      params: { size: '6-9M', days: 78 },
    });
  });

  it('clamps measurements outside every range to the nearest size', () => {
    expect(recommend({ heightMm: 900, weightG: 12_000 }).sizeCode).toBe('6-9M');
    expect(recommend({ heightMm: 300, weightG: 2_000, ageDays: 3 }).sizeCode).toBe('NB');
  });

  it('is deterministic', () => {
    expect(recommend()).toEqual(recommend());
  });
});
