import type { GarmentCondition } from '@bambino/types';

/**
 * Business policies the code depends on but the business has not decided yet
 * (docs/08-open-questions.md). Each is a PLACEHOLDER chosen to be easy to change: the
 * services read these values and contain no numbers of their own.
 */

/**
 * Open question 1. Exchange credit earned for an accepted returned garment, as a share of
 * that garment's catalogue price, in basis points (5000 = 50%), by inspected condition.
 */
export const EXCHANGE_CREDIT_POLICY: Record<GarmentCondition, number> = {
  NEW: 5_000,
  EXCELLENT: 4_000,
  GOOD: 3_000,
  FAIR: 1_500,
  DAMAGED: 0,
  RECYCLE: 0,
};

/** Subscription billing and renewal rules. Open question 6 covers how plan changes are charged. */
export const SUBSCRIPTION_POLICY = {
  /** Every plan change, up or down, takes effect at the next renewal (no proration until decided). */
  planChangeTiming: 'NEXT_RENEWAL' as const,
  /** Days a renewal may stay unpaid (PAST_DUE) before the subscription expires. */
  renewalGraceDays: 7,
  /** Automatic payment requests per renewal when a wallet is saved. */
  maxRenewalAttempts: 3,
  /** Hours between automatic renewal payment requests. */
  hoursBetweenRenewalAttempts: 24,
  /** Days before renewal that the reminder is sent. */
  reminderDaysBeforeRenewal: 3,
  /** Longest pause a customer can choose. */
  maxPauseDays: 90,
};

/** Sizing engine thresholds (see apps/api/src/domain/sizing.ts). */
export const SIZING_POLICY = {
  /** Measurements older than this lower confidence. */
  staleMeasurementDays: 30,
  /** Fit reports at one size before the engine moves the recommendation. */
  fitReportsToShiftSize: 2,
  /** With ROOMY fit, a baby in the top share of a size range is moved up one size (basis points of the range). */
  roomyUpperShareBasisPoints: 2_500,
};
