export interface RateLimitPolicy {
  readonly limit: number;
  readonly windowMs: number;
}

export interface RateLimiter {
  /** Records one attempt and returns false when the key is over its limit for the current window. */
  consume(key: string, policy: RateLimitPolicy): boolean;
}

/**
 * Fixed-window counter held in process memory. Correct for a single API instance,
 * which is the MVP deployment. Running several instances needs a shared store
 * (PostgreSQL or Redis) behind this same interface.
 */
export class MemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  consume(key: string, policy: RateLimitPolicy): boolean {
    const now = this.now();
    if (this.windows.size > 50_000) this.prune(now);
    const window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + policy.windowMs });
      return true;
    }
    window.count += 1;
    return window.count <= policy.limit;
  }

  private prune(now: number): void {
    for (const [key, window] of this.windows) if (window.resetAt <= now) this.windows.delete(key);
  }
}

/** Never limits. For tests that are not about rate limiting. */
export const unlimitedRateLimiter: RateLimiter = { consume: () => true };

export const RATE_LIMITS = {
  request: { limit: 600, windowMs: 60_000 },
  login: { limit: 10, windowMs: 60_000 },
  register: { limit: 5, windowMs: 10 * 60_000 },
  refresh: { limit: 30, windowMs: 60_000 },
  passwordReset: { limit: 5, windowMs: 15 * 60_000 },
  emailVerification: { limit: 5, windowMs: 15 * 60_000 },
} as const satisfies Record<string, RateLimitPolicy>;
