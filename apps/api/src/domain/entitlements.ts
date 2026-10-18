/**
 * Swap allowance arithmetic, kept free of the database so the rules can be tested on their own.
 * What counts as a swap, and when the count restarts, is defined in PLAN_ENTITLEMENT_POLICY (packages/config).
 */
export interface SwapAllowance {
  /** Swaps (garments exchanged) the plan includes per billing period; null means unlimited. */
  limit: number | null;
  /** Swaps already used in the current period (open and completed exchanges; rejected and cancelled ones are free). */
  used: number;
  /** Swaps left; null when unlimited. */
  remaining: number | null;
  /** When the count restarts: the end of the current period. */
  resetsAt: Date | null;
}

export function swapAllowance(limit: number | null, used: number, resetsAt: Date | null): SwapAllowance {
  return { limit, used, remaining: limit === null ? null : Math.max(0, limit - used), resetsAt };
}

/** True when asking for `requested` more swaps would go beyond the allowance. */
export function exceedsAllowance(allowance: SwapAllowance, requested: number): boolean {
  return allowance.limit !== null && allowance.used + requested > allowance.limit;
}

export function allowanceExceededMessage(allowance: SwapAllowance, requested: number): string {
  const left = allowance.remaining ?? 0;
  return (
    `Your plan includes ${allowance.limit} swap${allowance.limit === 1 ? '' : 's'} per billing period and ` +
    `${allowance.used} ${allowance.used === 1 ? 'is' : 'are'} already used, so ${left} ${left === 1 ? 'is' : 'are'} left. ` +
    `You asked for ${requested}.`
  );
}
