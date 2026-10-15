import { describe, expect, it } from 'vitest';
import { createTtlMemo } from './ttl-memo';

function clock(start = 1_000) {
  let value = start;
  return { now: () => value, advance: (ms: number) => (value += ms) };
}

describe('ttl memo', () => {
  it('answers from memory until the lifetime ends, then asks again', async () => {
    const time = clock();
    const memo = createTtlMemo({ ttlMs: 30_000, now: time.now });
    let calls = 0;
    const produce = async () => ++calls;

    expect(await memo.run('plans', produce)).toBe(1);
    expect(await memo.run('plans', produce)).toBe(1);
    time.advance(29_999);
    expect(await memo.run('plans', produce)).toBe(1);
    time.advance(2);
    expect(await memo.run('plans', produce)).toBe(2);
  });

  it('keeps different keys apart', async () => {
    const memo = createTtlMemo({ ttlMs: 30_000 });
    expect(await memo.run('a', async () => 'A')).toBe('A');
    expect(await memo.run('b', async () => 'B')).toBe('B');
  });

  it('lets concurrent callers share one request', async () => {
    const memo = createTtlMemo({ ttlMs: 30_000 });
    let calls = 0;
    const slow = () =>
      new Promise<number>((resolve) => {
        calls += 1;
        setTimeout(() => resolve(42), 5);
      });

    const results = await Promise.all([memo.run('k', slow), memo.run('k', slow), memo.run('k', slow)]);
    expect(results).toEqual([42, 42, 42]);
    expect(calls).toBe(1);
  });

  it('never remembers a failure', async () => {
    const memo = createTtlMemo({ ttlMs: 30_000 });
    let calls = 0;
    const flaky = async () => {
      calls += 1;
      if (calls === 1) throw new Error('API down');
      return 'ok';
    };

    await expect(memo.run('k', flaky)).rejects.toThrow('API down');
    expect(await memo.run('k', flaky)).toBe('ok');
    expect(calls).toBe(2);
  });

  it('forgets the oldest entry when full', async () => {
    const memo = createTtlMemo({ ttlMs: 30_000, maxEntries: 2 });
    await memo.run('a', async () => 1);
    await memo.run('b', async () => 2);
    await memo.run('c', async () => 3);
    expect(memo.size).toBe(2);

    let calls = 0;
    await memo.run('a', async () => ++calls); // evicted, so it is produced again
    expect(calls).toBe(1);
  });
});
