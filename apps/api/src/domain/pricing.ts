import type { TaxRule } from '@bambino/config';
import type { DiscountType, PromotionScope } from '@bambino/types';
import {
  type CurrencyCode,
  type Money,
  add,
  basisPointsOf,
  min,
  money,
  multiply,
  subtract,
  subtractFloorZero,
  sum,
  zero,
} from '@bambino/utils';

/**
 * Pure price calculation. The checkout service feeds it database prices and the
 * customer's choices; nothing here trusts or receives an amount from a client.
 */

export interface PricingLine {
  unitPrice: Money;
  quantity: number;
}

export interface PromotionRule {
  discountType: DiscountType;
  scope: PromotionScope;
  percentBasisPoints: number | null;
  fixedAmount: number | null;
  minSubtotalAmount: number;
  currency: string;
  startsAt: Date;
  endsAt: Date | null;
  isActive: boolean;
  maxRedemptions: number | null;
  maxRedemptionsPerUser: number;
}

export interface PromotionUsage {
  /** Redemptions by everyone. */
  total: number;
  /** Redemptions by this customer. */
  byCustomer: number;
}

export type PromotionRejection =
  | 'INACTIVE'
  | 'NOT_STARTED'
  | 'ENDED'
  | 'WRONG_SCOPE'
  | 'WRONG_CURRENCY'
  | 'BELOW_MINIMUM'
  | 'EXHAUSTED'
  | 'ALREADY_USED';

export type PromotionResult = { ok: true; discount: Money } | { ok: false; reason: PromotionRejection };

export function evaluatePromotion(
  rule: PromotionRule,
  input: { subtotal: Money; shipping: Money; scope: PromotionScope; usage: PromotionUsage; now: Date },
): PromotionResult {
  if (!rule.isActive) return { ok: false, reason: 'INACTIVE' };
  if (input.now < rule.startsAt) return { ok: false, reason: 'NOT_STARTED' };
  if (rule.endsAt && input.now >= rule.endsAt) return { ok: false, reason: 'ENDED' };
  if (rule.scope !== input.scope) return { ok: false, reason: 'WRONG_SCOPE' };
  if (rule.currency !== input.subtotal.currency) return { ok: false, reason: 'WRONG_CURRENCY' };
  if (input.subtotal.amount < rule.minSubtotalAmount) return { ok: false, reason: 'BELOW_MINIMUM' };
  if (rule.maxRedemptions !== null && input.usage.total >= rule.maxRedemptions)
    return { ok: false, reason: 'EXHAUSTED' };
  if (input.usage.byCustomer >= rule.maxRedemptionsPerUser) return { ok: false, reason: 'ALREADY_USED' };

  const { subtotal } = input;
  switch (rule.discountType) {
    case 'PERCENTAGE':
      return { ok: true, discount: min(basisPointsOf(subtotal, rule.percentBasisPoints ?? 0), subtotal) };
    case 'FIXED_AMOUNT':
      return { ok: true, discount: min(money(rule.fixedAmount ?? 0, subtotal.currency), subtotal) };
    case 'FREE_SHIPPING':
      return { ok: true, discount: input.shipping };
  }
}

export interface OrderTotals {
  subtotal: Money;
  discount: Money;
  shipping: Money;
  tax: Money;
  creditApplied: Money;
  total: Money;
}

/**
 * Order of operations: subtotal, minus discount, plus shipping, plus tax (only when
 * prices exclude it), then exchange credit settles part or all of what remains.
 * total = subtotal − discount + shipping + tax − credit, which the orders table re-checks.
 */
export function calculateTotals(input: {
  currency: CurrencyCode;
  lines: readonly PricingLine[];
  shipping: Money;
  discount?: Money;
  creditAvailable?: Money;
  tax: TaxRule | null;
}): OrderTotals {
  const { currency } = input;
  const subtotal = sum(
    input.lines.map((line) => multiply(line.unitPrice, line.quantity)),
    currency,
  );
  const discount = min(input.discount ?? zero(currency), add(subtotal, input.shipping));
  const taxable = subtractFloorZero(add(subtotal, input.shipping), discount);
  const tax =
    input.tax && !input.tax.includedInPrices
      ? basisPointsOf(taxable, input.tax.rateBasisPoints)
      : zero(currency);
  const due = add(taxable, tax);
  const creditApplied = min(input.creditAvailable ?? zero(currency), due);
  return {
    subtotal,
    discount,
    shipping: input.shipping,
    tax,
    creditApplied,
    total: subtract(due, creditApplied),
  };
}
