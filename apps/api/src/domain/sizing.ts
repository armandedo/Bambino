import { SIZING_POLICY } from '@bambino/config';
import type { FitPreference } from '@bambino/types';

/**
 * Rules-based size recommendation. Deterministic and explainable: every adjustment adds a
 * reason the app can show. It is not machine learning and is never presented as such; the
 * provider name is returned with every result. A trained model can replace it behind the
 * SizingProvider interface without any client change.
 */

export interface SizeRange {
  code: string;
  sortOrder: number;
  minAgeDays: number | null;
  maxAgeDays: number | null;
  minHeightMm: number | null;
  maxHeightMm: number | null;
  minWeightG: number | null;
  maxWeightG: number | null;
}

export interface SizingInput {
  ageDays: number;
  heightMm: number | null;
  weightG: number | null;
  /** Days since the latest measurement was taken; null when there is none. */
  measurementAgeDays: number | null;
  fitPreference: FitPreference;
  /** Earlier height readings, oldest first, used to estimate when the next size is needed. */
  heightHistory: readonly { heightMm: number; daysAgo: number }[];
  /** Past fit reports per size code. */
  fitHistory: Readonly<Record<string, { tooSmall: number; tooLarge: number }>>;
}

export interface SizingReason {
  key: string;
  params?: Record<string, string | number>;
}

export interface SizingResult {
  sizeCode: string;
  nextSizeCode: string | null;
  /** 0-10000 basis points. */
  confidenceBasisPoints: number;
  reasons: SizingReason[];
}

export interface SizingProvider {
  readonly name: string;
  readonly version: string;
  recommend(input: SizingInput, sizes: readonly SizeRange[]): SizingResult;
}

type Measure = 'height' | 'weight' | 'age';

function bounds(size: SizeRange, measure: Measure): [number | null, number | null] {
  if (measure === 'height') return [size.minHeightMm, size.maxHeightMm];
  if (measure === 'weight') return [size.minWeightG, size.maxWeightG];
  return [size.minAgeDays, size.maxAgeDays];
}

/** The largest size whose range contains the value (ranges may overlap at the edges). */
function sizeFor(sizes: readonly SizeRange[], measure: Measure, value: number | null): SizeRange | null {
  if (value === null) return null;
  const matches = sizes.filter((size) => {
    const [low, high] = bounds(size, measure);
    return low !== null && high !== null && value >= low && value < high;
  });
  if (matches.length > 0) return matches[matches.length - 1] ?? null;
  // Outside every range: clamp to the smallest or largest size that defines this measure.
  const defined = sizes.filter((size) => bounds(size, measure).every((bound) => bound !== null));
  const first = defined[0];
  const last = defined[defined.length - 1];
  if (!first || !last) return null;
  return value < (bounds(first, measure)[0] ?? 0) ? first : last;
}

export class RulesBasedSizingProvider implements SizingProvider {
  readonly name = 'rules';
  readonly version = '1';

  recommend(input: SizingInput, unsorted: readonly SizeRange[]): SizingResult {
    const sizes = [...unsorted].sort((a, b) => a.sortOrder - b.sortOrder);
    const first = sizes[0];
    if (!first) throw new Error('No sizes configured');
    const reasons: SizingReason[] = [];
    const indexOf = (size: SizeRange) => sizes.findIndex((candidate) => candidate.code === size.code);

    const byHeight = sizeFor(sizes, 'height', input.heightMm);
    const byWeight = sizeFor(sizes, 'weight', input.weightG);
    const byAge = sizeFor(sizes, 'age', input.ageDays);

    let chosen: SizeRange;
    let measure: Measure;
    let confidence: number;
    if (byHeight && byWeight) {
      if (byHeight.code === byWeight.code) {
        chosen = byHeight;
        confidence = 9_000;
        reasons.push({ key: 'sizing.reason.height_and_weight_agree', params: { size: chosen.code } });
      } else {
        // When height and weight disagree, the larger size avoids clothes that are already too small.
        chosen = indexOf(byHeight) > indexOf(byWeight) ? byHeight : byWeight;
        confidence = 7_000;
        reasons.push({
          key: 'sizing.reason.measurements_disagree',
          params: { byHeight: byHeight.code, byWeight: byWeight.code },
        });
      }
      measure = chosen === byHeight ? 'height' : 'weight';
    } else if (byHeight || byWeight) {
      chosen = (byHeight ?? byWeight) as SizeRange;
      measure = byHeight ? 'height' : 'weight';
      confidence = 7_500;
      reasons.push({ key: `sizing.reason.${measure}_in_range`, params: { size: chosen.code } });
    } else {
      chosen = byAge ?? first;
      measure = 'age';
      confidence = 5_000;
      reasons.push({ key: 'sizing.reason.age_only', params: { size: chosen.code } });
    }

    if (input.measurementAgeDays !== null && input.measurementAgeDays > SIZING_POLICY.staleMeasurementDays) {
      confidence -= 1_000;
      reasons.push({ key: 'sizing.reason.measurement_stale', params: { days: input.measurementAgeDays } });
    }

    const shift = (by: number) => {
      const next = sizes[Math.min(Math.max(indexOf(chosen) + by, 0), sizes.length - 1)];
      if (next) chosen = next;
    };

    // Fit preference: ROOMY moves a baby near the top of a range up one size.
    if (input.fitPreference === 'ROOMY' && measure !== 'age') {
      const [low, high] = bounds(chosen, measure);
      const value = measure === 'height' ? input.heightMm : input.weightG;
      if (low !== null && high !== null && value !== null && high > low) {
        const fromTop = ((high - value) * 10_000) / (high - low);
        if (fromTop <= SIZING_POLICY.roomyUpperShareBasisPoints && indexOf(chosen) < sizes.length - 1) {
          shift(1);
          reasons.push({ key: 'sizing.reason.fit_preference_roomy', params: { size: chosen.code } });
        }
      }
    }

    // Fit history: repeated reports at a size move the recommendation.
    const history = input.fitHistory[chosen.code];
    if (
      history &&
      history.tooSmall >= SIZING_POLICY.fitReportsToShiftSize &&
      indexOf(chosen) < sizes.length - 1
    ) {
      const from = chosen.code;
      shift(1);
      reasons.push({ key: 'sizing.reason.history_too_small', params: { from, size: chosen.code } });
    } else if (history && history.tooLarge >= SIZING_POLICY.fitReportsToShiftSize && indexOf(chosen) > 0) {
      const from = chosen.code;
      shift(-1);
      reasons.push({ key: 'sizing.reason.history_too_large', params: { from, size: chosen.code } });
    }

    const next = sizes[indexOf(chosen) + 1] ?? null;
    if (next) {
      const estimate = this.daysUntilOutgrown(input, chosen);
      reasons.push(
        estimate === null
          ? { key: 'sizing.reason.next_size', params: { size: next.code } }
          : { key: 'sizing.reason.next_size_in_days', params: { size: next.code, days: estimate } },
      );
    }

    return {
      sizeCode: chosen.code,
      nextSizeCode: next?.code ?? null,
      confidenceBasisPoints: Math.min(Math.max(confidence, 1_000), 9_500),
      reasons,
    };
  }

  /** Days until height reaches the top of the size, from growth between the oldest and latest readings. */
  private daysUntilOutgrown(input: SizingInput, size: SizeRange): number | null {
    const oldest = input.heightHistory[0];
    if (!oldest || input.heightMm === null || size.maxHeightMm === null || input.measurementAgeDays === null)
      return null;
    const spanDays = oldest.daysAgo - input.measurementAgeDays;
    const grownMm = input.heightMm - oldest.heightMm;
    if (spanDays <= 0 || grownMm <= 0) return null;
    const remainingMm = size.maxHeightMm - input.heightMm;
    if (remainingMm <= 0) return 0;
    return Math.max(0, Math.round((remainingMm * spanDays) / grownMm) - input.measurementAgeDays);
  }
}
