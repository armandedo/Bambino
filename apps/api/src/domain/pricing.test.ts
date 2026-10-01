import { money } from '@bambino/utils';
import { describe, expect, it } from 'vitest';
import { type PromotionRule, calculateTotals, evaluatePromotion } from './pricing';

const rwf = (amount: number) => money(amount, 'RWF');
const now = new Date('2026-10-01T10:00:00Z');

const rule = (overrides: Partial<PromotionRule> = {}): PromotionRule => ({
  discountType: 'PERCENTAGE',
  scope: 'ORDER',
  percentBasisPoints: 1_000,
  fixedAmount: null,
  minSubtotalAmount: 0,
  currency: 'RWF',
  startsAt: new Date('2026-09-01T00:00:00Z'),
  endsAt: null,
  isActive: true,
  maxRedemptions: null,
  maxRedemptionsPerUser: 1,
  ...overrides,
});

const context = {
  subtotal: rwf(21_000),
  shipping: rwf(2_000),
  scope: 'ORDER' as const,
  usage: { total: 0, byCustomer: 0 },
  now,
};

describe('evaluatePromotion', () => {
  it('computes percentage, fixed and free-shipping discounts', () => {
    expect(evaluatePromotion(rule(), context)).toEqual({ ok: true, discount: rwf(2_100) });
    expect(
      evaluatePromotion(
        rule({ discountType: 'FIXED_AMOUNT', percentBasisPoints: null, fixedAmount: 5_000 }),
        context,
      ),
    ).toEqual({
      ok: true,
      discount: rwf(5_000),
    });
    expect(
      evaluatePromotion(rule({ discountType: 'FREE_SHIPPING', percentBasisPoints: null }), context),
    ).toEqual({
      ok: true,
      discount: rwf(2_000),
    });
  });

  it('never discounts more than the subtotal', () => {
    const fixed = rule({ discountType: 'FIXED_AMOUNT', percentBasisPoints: null, fixedAmount: 50_000 });
    expect(evaluatePromotion(fixed, context)).toEqual({ ok: true, discount: rwf(21_000) });
    expect(evaluatePromotion(rule({ percentBasisPoints: 10_000 }), context)).toEqual({
      ok: true,
      discount: rwf(21_000),
    });
  });

  it.each([
    [{ isActive: false }, 'INACTIVE'],
    [{ startsAt: new Date('2026-11-01T00:00:00Z') }, 'NOT_STARTED'],
    [{ endsAt: now }, 'ENDED'],
    [{ scope: 'SUBSCRIPTION' as const }, 'WRONG_SCOPE'],
    [{ currency: 'KES' }, 'WRONG_CURRENCY'],
    [{ minSubtotalAmount: 30_000 }, 'BELOW_MINIMUM'],
  ])('rejects %o as %s', (overrides, reason) => {
    expect(evaluatePromotion(rule(overrides), context)).toEqual({ ok: false, reason });
  });

  it('enforces total and per-customer redemption limits', () => {
    expect(
      evaluatePromotion(rule({ maxRedemptions: 10 }), { ...context, usage: { total: 10, byCustomer: 0 } }),
    ).toEqual({
      ok: false,
      reason: 'EXHAUSTED',
    });
    expect(evaluatePromotion(rule(), { ...context, usage: { total: 3, byCustomer: 1 } })).toEqual({
      ok: false,
      reason: 'ALREADY_USED',
    });
    expect(
      evaluatePromotion(rule({ maxRedemptionsPerUser: 2 }), {
        ...context,
        usage: { total: 3, byCustomer: 1 },
      }).ok,
    ).toBe(true);
  });
});

describe('calculateTotals', () => {
  const lines = [
    { unitPrice: rwf(10_500), quantity: 2 },
    { unitPrice: rwf(4_000), quantity: 1 },
  ];

  it('adds lines and shipping without tax when the market has no tax rule', () => {
    const totals = calculateTotals({ currency: 'RWF', lines, shipping: rwf(2_000), tax: null });
    expect(totals).toEqual({
      subtotal: rwf(25_000),
      discount: rwf(0),
      shipping: rwf(2_000),
      tax: rwf(0),
      creditApplied: rwf(0),
      total: rwf(27_000),
    });
  });

  it('applies a discount, then exclusive tax, then credit', () => {
    const totals = calculateTotals({
      currency: 'RWF',
      lines,
      shipping: rwf(2_000),
      discount: rwf(2_500),
      creditAvailable: rwf(5_000),
      tax: { labelKey: 'tax.vat', rateBasisPoints: 1_800, includedInPrices: false },
    });
    // taxable = 25,000 + 2,000 − 2,500 = 24,500; tax 18% = 4,410; due 28,910; credit 5,000.
    expect(totals.tax).toEqual(rwf(4_410));
    expect(totals.creditApplied).toEqual(rwf(5_000));
    expect(totals.total).toEqual(rwf(23_910));
    const { subtotal, discount, shipping, tax, creditApplied, total } = totals;
    expect(total.amount).toBe(
      subtotal.amount - discount.amount + shipping.amount + tax.amount - creditApplied.amount,
    );
  });

  it('adds no tax line when prices already include tax', () => {
    const totals = calculateTotals({
      currency: 'RWF',
      lines,
      shipping: rwf(0),
      tax: { labelKey: 'tax.vat', rateBasisPoints: 1_800, includedInPrices: true },
    });
    expect(totals.tax).toEqual(rwf(0));
    expect(totals.total).toEqual(rwf(25_000));
  });

  it('uses only as much credit as is due, so the total never goes negative', () => {
    const totals = calculateTotals({
      currency: 'RWF',
      lines,
      shipping: rwf(2_000),
      creditAvailable: rwf(100_000),
      tax: null,
    });
    expect(totals.creditApplied).toEqual(rwf(27_000));
    expect(totals.total).toEqual(rwf(0));
  });

  it('handles an empty cart', () => {
    expect(calculateTotals({ currency: 'RWF', lines: [], shipping: rwf(0), tax: null }).total).toEqual(
      rwf(0),
    );
  });
});
