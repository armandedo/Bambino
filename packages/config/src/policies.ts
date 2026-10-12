import type { GarmentCondition, OrderStatus, OrderType } from '@bambino/types';

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

/**
 * Open question 15. Pay on delivery (cash). PLACEHOLDER values: easy to change, and the services contain no
 * numbers of their own. Only shop orders qualify: a subscription needs a payment method that can be charged again.
 */
export const CASH_ON_DELIVERY_POLICY = {
  enabled: true,
  /** Largest order total (in the smallest currency unit) accepted for cash on delivery. */
  maxOrderAmount: 150_000,
  /** Order types that can be paid on delivery. */
  orderTypes: ['ONE_TIME'] as readonly OrderType[],
};

/**
 * Open question 13. Cancellations and refunds. PLACEHOLDER: the most cautious reading until the business decides.
 * Every refund starts REQUESTED and waits for staff with refund:write to approve it.
 */
export const REFUND_POLICY = {
  /** Order types a paid order can be cancelled (with a refund) for. Subscription and exchange orders: not yet. */
  cancellableOrderTypes: ['ONE_TIME'] as readonly OrderType[],
  /** A customer can cancel a paid (or confirmed cash) order only before it is being prepared. */
  customerCancellableStatuses: ['PAID', 'CONFIRMED'] as readonly OrderStatus[],
  /** Staff can cancel a paid or confirmed order until it leaves the warehouse. */
  staffCancellableStatuses: [
    'PAID',
    'CONFIRMED',
    'PROCESSING',
    'PACKED',
    'READY_FOR_DISPATCH',
  ] as readonly OrderStatus[],
  /** Whether staff may refund as exchange credit instead of money back to the wallet. */
  allowRefundAsCredit: false,
};

/**
 * Open question 14. Data protection timings (Rwanda Law 058/2021). PLACEHOLDER until the business and its counsel
 * decide. See docs/03-auth-and-security.md for what is kept after deletion and why.
 */
export const PRIVACY_POLICY = {
  /** Days between a deletion request and carrying it out, so a mistaken request can be noticed. */
  deletionGraceDays: 14,
  /** Days a generated export stays downloadable before the file is deleted. */
  exportRetentionDays: 7,
  /** Minutes a signed export download link stays valid. */
  exportLinkMinutes: 15,
};
