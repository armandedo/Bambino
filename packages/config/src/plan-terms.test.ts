import { describe, expect, it } from 'vitest';
import { type PlanTermsInput, planTerms } from './plan-terms';
import { PLAN_ENTITLEMENT_POLICY, SUBSCRIPTION_POLICY } from './policies';

const base: PlanTermsInput = {
  billingInterval: 'MONTHLY',
  itemsPerCycle: 5,
  exchangesPerCycle: 5,
  priceText: 'RF 39,000',
};
const text = (input: PlanTermsInput = base, id = 'swaps') =>
  planTerms(input).find((term) => term.id === id)?.text ?? '';

describe('plan terms', () => {
  it('states every term the customer needs before subscribing', () => {
    expect(planTerms(base).map((term) => term.id)).toEqual([
      'price',
      'box',
      'swaps',
      'renewal',
      'failed-payment',
      'pause',
      'plan-change',
      'cancel',
    ]);
  });

  it('states the amount, the interval and that delivery is charged separately', () => {
    const price = text(base, 'price');
    expect(price).toContain('RF 39,000 every month');
    expect(price).toMatch(/Delivery is charged separately with each period/);
    expect(text({ ...base, billingInterval: 'QUARTERLY' }, 'price')).toContain('every 3 months');
    expect(text({ ...base, billingInterval: 'ANNUAL' }, 'price')).toContain('every year');
  });

  it('defines the box as garments held at a time, not per year or per delivery', () => {
    expect(text({ ...base, itemsPerCycle: 6, billingInterval: 'ANNUAL' }, 'box')).toBe(
      'Up to 6 garments at a time. You choose them at the start of each year.',
    );
  });

  it('defines a swap, the allowance, the reset and the price', () => {
    const swaps = text();
    expect(swaps).toContain('A swap is one garment sent back and one other garment sent to you.');
    expect(swaps).toContain('Your plan includes 5 swaps per month.');
    expect(swaps).toMatch(/starts again at each renewal.*do not carry over/);
    expect(swaps).toMatch(/costs nothing extra; you pay only the delivery fee/);
    expect(swaps).toMatch(/once the returned garment has passed our inspection/);
  });

  it('words unlimited, single and no-swap plans correctly', () => {
    expect(text({ ...base, exchangesPerCycle: null })).toContain('unlimited swaps');
    expect(text({ ...base, exchangesPerCycle: 1 })).toContain('includes 1 swap per month');
    expect(text({ ...base, exchangesPerCycle: 0 })).toContain('does not include swaps');
  });

  it('reads the numbers from the policy, so the words follow the rules', () => {
    const renewal = text(base, 'renewal');
    expect(renewal).toContain(`up to ${SUBSCRIPTION_POLICY.maxRenewalAttempts} attempts`);
    expect(renewal).toContain(`${SUBSCRIPTION_POLICY.hoursBetweenRenewalAttempts} hours apart`);
    expect(text(base, 'failed-payment')).toContain(`${SUBSCRIPTION_POLICY.renewalGraceDays} days`);
    expect(text(base, 'pause')).toContain(`${SUBSCRIPTION_POLICY.maxPauseDays} days`);
  });

  it('says the period restarts allowance and nothing carries over, matching the policy flags', () => {
    expect(PLAN_ENTITLEMENT_POLICY.carryOverUnused).toBe(false);
    expect(PLAN_ENTITLEMENT_POLICY.allowanceResets).toBe('EACH_BILLING_PERIOD');
  });

  it('tells the truth about cancelling and refunds', () => {
    const cancel = text(base, 'cancel');
    expect(cancel).toMatch(/runs to the end of the period you have paid for/);
    expect(cancel).toMatch(/not refunded/);
  });

  it('states the tax position of the market', () => {
    expect(text(base, 'price')).toContain('No tax is added to this price.');
  });
});
