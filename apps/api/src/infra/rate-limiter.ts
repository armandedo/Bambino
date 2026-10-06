import { type Database } from '@bambino/database';
import { queryRows } from '@bambino/database/query';
import { sql } from '@bambino/database/orm';

export interface RateLimitPolicy {
  readonly limit: number;
  readonly windowMs: number;
}

export interface RateLimiter {
  /** Records one attempt and resolves false when the key is over its limit for the current window. */
  consume(key: string, policy: RateLimitPolicy): Promise<boolean>;
  /** Removes expired windows. Run by the background job; a no-op where nothing is stored. */
  prune?(): Promise<number>;
}

/**
 * Fixed-window counter held in process memory. Correct for a single API instance and used in development and
 * tests. Several instances share limits through PostgresRateLimiter (RATE_LIMITER=postgres).
 */
export class MemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  async consume(key: string, policy: RateLimitPolicy): Promise<boolean> {
    const now = this.now();
    if (this.windows.size > 50_000) this.dropExpired(now);
    const window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + policy.windowMs });
      return true;
    }
    window.count += 1;
    return window.count <= policy.limit;
  }

  private dropExpired(now: number): void {
    for (const [key, window] of this.windows) if (window.resetAt <= now) this.windows.delete(key);
  }
}

/**
 * Fixed-window counter in PostgreSQL, shared by every API instance. One atomic upsert per attempt: a window that
 * has ended restarts at 1, otherwise the count goes up. Expired windows are removed by `prune` (background job).
 */
export class PostgresRateLimiter implements RateLimiter {
  constructor(
    private readonly db: Database,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async consume(key: string, policy: RateLimitPolicy): Promise<boolean> {
    const now = this.now();
    const resetAt = new Date(now.getTime() + policy.windowMs);
    const rows = await queryRows<{ count: number }>(
      this.db,
      sql`INSERT INTO rate_limit_windows (key, count, reset_at)
          VALUES (${key}, 1, ${resetAt.toISOString()})
          ON CONFLICT (key) DO UPDATE SET
            count = CASE WHEN rate_limit_windows.reset_at <= ${now.toISOString()} THEN 1 ELSE rate_limit_windows.count + 1 END,
            reset_at = CASE WHEN rate_limit_windows.reset_at <= ${now.toISOString()} THEN EXCLUDED.reset_at ELSE rate_limit_windows.reset_at END
          RETURNING count`,
    );
    return Number(rows[0]?.count ?? 1) <= policy.limit;
  }

  async prune(): Promise<number> {
    const rows = await queryRows<{ key: string }>(
      this.db,
      sql`DELETE FROM rate_limit_windows WHERE reset_at <= ${this.now().toISOString()} RETURNING key`,
    );
    return rows.length;
  }
}

/** Never limits. For tests that are not about rate limiting. */
export const unlimitedRateLimiter: RateLimiter = { consume: async () => true };

export const RATE_LIMITS = {
  request: { limit: 600, windowMs: 60_000 },
  login: { limit: 10, windowMs: 60_000 },
  register: { limit: 5, windowMs: 10 * 60_000 },
  refresh: { limit: 30, windowMs: 60_000 },
  passwordReset: { limit: 5, windowMs: 15 * 60_000 },
  emailVerification: { limit: 5, windowMs: 15 * 60_000 },
} as const satisfies Record<string, RateLimitPolicy>;
