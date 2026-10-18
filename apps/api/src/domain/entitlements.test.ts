import { describe, expect, it } from 'vitest';
import { allowanceExceededMessage, exceedsAllowance, swapAllowance } from './entitlements';

const END = new Date('2026-11-01T00:00:00Z');

describe('swap allowance', () => {
  it('counts what is left and never goes below zero', () => {
    expect(swapAllowance(5, 2, END)).toEqual({ limit: 5, used: 2, remaining: 3, resetsAt: END });
    expect(swapAllowance(5, 7, END).remaining).toBe(0);
  });

  it('treats a null limit as unlimited', () => {
    const unlimited = swapAllowance(null, 40, END);
    expect(unlimited.remaining).toBeNull();
    expect(exceedsAllowance(unlimited, 100)).toBe(false);
  });

  it('allows a request that exactly uses the rest, and refuses one more', () => {
    const allowance = swapAllowance(5, 3, END);
    expect(exceedsAllowance(allowance, 2)).toBe(false);
    expect(exceedsAllowance(allowance, 3)).toBe(true);
  });

  it('refuses everything when the plan includes no swaps', () => {
    expect(exceedsAllowance(swapAllowance(0, 0, END), 1)).toBe(true);
  });

  it('explains a refusal in plain words', () => {
    expect(allowanceExceededMessage(swapAllowance(5, 4, END), 3)).toBe(
      'Your plan includes 5 swaps per billing period and 4 are already used, so 1 is left. You asked for 3.',
    );
    expect(allowanceExceededMessage(swapAllowance(1, 1, END), 1)).toMatch(/includes 1 swap per/);
  });
});
