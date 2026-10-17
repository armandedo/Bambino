import type { DeliveryOption, PlanSummary } from '@bambino/api-client';
import { describe, expect, it } from 'vitest';
import { buildHighlights, deliveryDays, parsePaymentMethods, paymentAnswer } from './highlights';

const rwf = (amount: number) => ({ amount, currency: 'RWF' });
const option = (name: string, fee: number, min: number, max: number): DeliveryOption => ({
  code: name,
  name,
  fee: rwf(fee),
  estimatedDaysMin: min,
  estimatedDaysMax: max,
});
const plan = (exchangesPerCycle: number | null): PlanSummary => ({
  id: String(exchangesPerCycle),
  code: 'P',
  name: 'Plan',
  description: '',
  billingInterval: 'MONTHLY',
  price: rwf(1),
  itemsPerCycle: 4,
  exchangesPerCycle,
});

const base = { delivery: null, plans: null, paymentMethods: [], mockPayments: false };
const get = (highlights: ReturnType<typeof buildHighlights>, id: string) =>
  highlights.find((h) => h.id === id);

describe('delivery highlight', () => {
  it('lists each real option with its fee and time, cheapest first, and states the conditions', () => {
    const h = get(
      buildHighlights({
        ...base,
        delivery: [option('Same-day', 4000, 0, 0), option('Standard', 2000, 1, 3)],
      }),
      'delivery',
    );
    expect(h?.body).toContain('Standard: ');
    expect(h?.body.indexOf('Standard')).toBeLessThan(h?.body.indexOf('Same-day') ?? 0);
    expect(h?.body).toMatch(/1 to 3 days/);
    expect(h?.body).toMatch(/same day/);
    expect(h?.note).toMatch(/Kigali only/);
    expect(h?.note).toMatch(/confirmed at checkout/);
  });

  it('makes no promise when the options could not be loaded', () => {
    const h = get(buildHighlights({ ...base, delivery: null }), 'delivery');
    expect(h?.body).toBe('Delivery options and fees are shown at checkout.');
    expect(h?.body).not.toMatch(/same-day|standard/i);
  });

  it('words the days plainly', () => {
    expect(deliveryDays({ estimatedDaysMin: 0, estimatedDaysMax: 0 })).toBe('same day');
    expect(deliveryDays({ estimatedDaysMin: 1, estimatedDaysMax: 1 })).toBe('next day');
    expect(deliveryDays({ estimatedDaysMin: 2, estimatedDaysMax: 2 })).toBe('2 days');
    expect(deliveryDays({ estimatedDaysMin: 1, estimatedDaysMax: 3 })).toBe('1 to 3 days');
  });
});

describe('payment highlight', () => {
  it('names no mobile-money brand until one is switched on', () => {
    const h = get(buildHighlights(base), 'payment');
    expect(h?.body).not.toMatch(/MTN|Airtel|MoMo/i);
    expect(h?.body).toMatch(/Cash on delivery up to/);
    expect(h?.note).toBe('More payment options are coming.');
  });

  it('names the mobile-money brands that are live', () => {
    const h = get(buildHighlights({ ...base, paymentMethods: ['MTN MoMo', 'Airtel Money'] }), 'payment');
    expect(h?.body).toContain('MTN MoMo, Airtel Money');
    expect(h?.note).toMatch(/PIN/);
  });

  it('labels test wallets as preview only, and never when mock payments are off', () => {
    expect(get(buildHighlights({ ...base, mockPayments: true }), 'payment')?.body).toMatch(/preview only/);
    expect(get(buildHighlights(base), 'payment')?.body).not.toMatch(/test|preview/i);
  });

  it('parses the environment list', () => {
    expect(parsePaymentMethods(' MTN MoMo , Airtel Money ,')).toEqual(['MTN MoMo', 'Airtel Money']);
    expect(parsePaymentMethods(undefined)).toEqual([]);
    expect(parsePaymentMethods('')).toEqual([]);
  });
});

describe('swap highlight', () => {
  it('states the allowance from the plans', () => {
    expect(get(buildHighlights({ ...base, plans: [plan(2), plan(4)] }), 'swap')?.note).toBe(
      'Each plan includes 2 to 4 swaps per cycle.',
    );
    expect(get(buildHighlights({ ...base, plans: [plan(1)] }), 'swap')?.note).toBe(
      'Each plan includes 1 swap per cycle.',
    );
  });

  it('does not promise unlimited swaps when a plan has no stated allowance', () => {
    expect(get(buildHighlights({ ...base, plans: [plan(2), plan(null)] }), 'swap')?.note).toBe(
      'The number of swaps depends on your plan.',
    );
    expect(get(buildHighlights(base), 'swap')?.body).not.toMatch(/whenever/i);
  });
});

describe('plans FAQ payment answer', () => {
  it('names the live mobile-money brands, says cash is for shop orders only, and has no test wording', () => {
    const answer = paymentAnswer({ paymentMethods: ['MTN MoMo'], mockPayments: false });
    expect(answer).toContain('mobile money (MTN MoMo)');
    expect(answer).toMatch(/Shop orders \(not plans\) up to .* cash on delivery/);
    expect(answer).not.toMatch(/preview|test/i);
  });

  it('is honest when mobile money is not switched on', () => {
    const answer = paymentAnswer({ paymentMethods: [], mockPayments: false });
    expect(answer).toContain('not switched on yet');
    expect(answer).not.toMatch(/MTN|Airtel/);
  });

  it('mentions test wallets only in a preview', () => {
    expect(paymentAnswer({ paymentMethods: [], mockPayments: true })).toContain(
      'This preview uses test wallets.',
    );
  });
});
