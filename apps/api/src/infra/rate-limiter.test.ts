import { createTestDatabase } from '@bambino/database/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MemoryRateLimiter, PostgresRateLimiter, type RateLimiter } from './rate-limiter';

const policy = { limit: 3, windowMs: 60_000 };
let database: Awaited<ReturnType<typeof createTestDatabase>>;
let clock = new Date('2026-10-01T08:00:00Z');

beforeAll(async () => {
  database = await createTestDatabase();
}, 120_000);

afterAll(async () => {
  await database.close();
});

const limiters: [string, () => RateLimiter][] = [
  ['memory', () => new MemoryRateLimiter(() => clock.getTime())],
  ['postgres', () => new PostgresRateLimiter(database.db, () => clock)],
];

describe.each(limiters)('%s rate limiter', (name, make) => {
  it('allows up to the limit in a window, then refuses, and starts again in the next window', async () => {
    const limiter = make();
    const key = `${name}:login:10.0.0.1`;
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await limiter.consume(key, policy));
    expect(results).toEqual([true, true, true, false]);
    clock = new Date(clock.getTime() + policy.windowMs);
    expect(await limiter.consume(key, policy)).toBe(true);
  });

  it('counts each key separately', async () => {
    const limiter = make();
    for (let i = 0; i < 3; i++) await limiter.consume(`${name}:a`, policy);
    expect(await limiter.consume(`${name}:a`, policy)).toBe(false);
    expect(await limiter.consume(`${name}:b`, policy)).toBe(true);
  });
});

describe('postgres rate limiter', () => {
  it('is shared by every instance using the same database', async () => {
    const first = new PostgresRateLimiter(database.db, () => clock);
    const second = new PostgresRateLimiter(database.db, () => clock);
    for (let i = 0; i < 3; i++) await first.consume('shared:key', policy);
    expect(await second.consume('shared:key', policy)).toBe(false);
  });

  it('counts concurrent attempts exactly', async () => {
    const limiter = new PostgresRateLimiter(database.db, () => clock);
    const results = await Promise.all(Array.from({ length: 10 }, () => limiter.consume('burst:key', policy)));
    expect(results.filter(Boolean)).toHaveLength(3);
  });

  it('prunes windows that have ended', async () => {
    const limiter = new PostgresRateLimiter(database.db, () => clock);
    await limiter.consume('old:key', policy);
    clock = new Date(clock.getTime() + 2 * policy.windowMs);
    expect(await limiter.prune()).toBeGreaterThanOrEqual(1);
    expect(await limiter.prune()).toBe(0);
  });
});
