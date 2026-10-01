import { describe, expect, it } from 'vitest';
import {
  MoneyError,
  add,
  basisPointsOf,
  formatMoney,
  isCurrencyCode,
  min,
  money,
  multiply,
  subtract,
  subtractFloorZero,
  sum,
} from './money';

describe('money', () => {
  it('rejects non-integer and unsafe amounts', () => {
    expect(() => money(10.5, 'RWF')).toThrow(MoneyError);
    expect(() => money(Number.MAX_SAFE_INTEGER + 1, 'RWF')).toThrow(MoneyError);
    expect(() => money(Number.NaN, 'RWF')).toThrow(MoneyError);
  });

  it('adds, subtracts and multiplies in minor units', () => {
    const price = money(10_500, 'RWF');
    expect(add(price, money(2_000, 'RWF'))).toEqual({ amount: 12_500, currency: 'RWF' });
    expect(subtract(price, money(500, 'RWF'))).toEqual({ amount: 10_000, currency: 'RWF' });
    expect(multiply(price, 3)).toEqual({ amount: 31_500, currency: 'RWF' });
    expect(sum([price, price, price], 'RWF').amount).toBe(31_500);
    expect(sum([], 'RWF').amount).toBe(0);
  });

  it('refuses to mix currencies', () => {
    expect(() => add(money(1, 'RWF'), money(1, 'KES'))).toThrow(MoneyError);
    expect(() => subtract(money(1, 'RWF'), money(1, 'USD'))).toThrow(MoneyError);
    expect(() => min(money(1, 'RWF'), money(1, 'USD'))).toThrow(MoneyError);
  });

  it('refuses fractional quantities', () => {
    expect(() => multiply(money(100, 'RWF'), 1.5)).toThrow(MoneyError);
  });

  it('computes basis-point shares rounding half up', () => {
    expect(basisPointsOf(money(10_500, 'RWF'), 1_000).amount).toBe(1_050);
    // 15% of 999 = 149.85 -> 150
    expect(basisPointsOf(money(999, 'RWF'), 1_500).amount).toBe(150);
    // 12.5% of 100 = 12.5 -> 13 (half up)
    expect(basisPointsOf(money(100, 'RWF'), 1_250).amount).toBe(13);
    // 0.1 + 0.2 style inputs must stay exact: 30% of 10 = 3
    expect(basisPointsOf(money(10, 'KES'), 3_000).amount).toBe(3);
    expect(basisPointsOf(money(0, 'RWF'), 5_000).amount).toBe(0);
  });

  it('keeps basis-point maths exact beyond the float-safe product range', () => {
    const large = money(9_000_000_000_000, 'RWF');
    expect(basisPointsOf(large, 1_800).amount).toBe(1_620_000_000_000);
  });

  it('rejects invalid basis-point input', () => {
    expect(() => basisPointsOf(money(100, 'RWF'), -1)).toThrow(MoneyError);
    expect(() => basisPointsOf(money(100, 'RWF'), 12.5)).toThrow(MoneyError);
    expect(() => basisPointsOf(money(-100, 'RWF'), 100)).toThrow(MoneyError);
  });

  it('floors at zero when a deduction exceeds the amount', () => {
    expect(subtractFloorZero(money(500, 'RWF'), money(800, 'RWF')).amount).toBe(0);
    expect(subtractFloorZero(money(800, 'RWF'), money(500, 'RWF')).amount).toBe(300);
  });

  it('formats using the currency exponent', () => {
    expect(formatMoney(money(10_500, 'RWF'), 'en-RW')).toMatch(/10,500/);
    expect(formatMoney(money(10_500, 'RWF'), 'en-RW')).not.toMatch(/\./);
    expect(formatMoney(money(10_550, 'KES'), 'en-KE')).toMatch(/105\.50/);
    expect(formatMoney(money(5, 'USD'), 'en-US')).toBe('$0.05');
    expect(formatMoney(money(-1_250, 'USD'), 'en-US')).toBe('-$12.50');
  });

  it('recognises configured currency codes only', () => {
    expect(isCurrencyCode('RWF')).toBe(true);
    expect(isCurrencyCode('EUR')).toBe(false);
    expect(isCurrencyCode('toString')).toBe(false);
  });
});
