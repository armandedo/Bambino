/**
 * A tiny in-memory cache for public, identical-for-everyone reads (plans, categories, sizes, the newest products).
 *
 * Why it exists: pages are rendered per request (the CSP nonce rules out a shared page cache) and the Cloudflare
 * build has no Next.js data cache configured, so every render of the home page made three API round trips, each
 * crossing to the API Worker and the database. One Worker instance serves many requests, so remembering the
 * answer for a few seconds removes almost all of that for busy pages.
 *
 * Rules that keep it safe:
 * - Only use it for anonymous queries. Nothing here knows who is asking.
 * - Concurrent callers share one in-flight request.
 * - A failure is never remembered; the next caller tries again.
 * - The memory is bounded: the oldest entry goes first.
 */
export interface TtlMemoOptions {
  ttlMs: number;
  maxEntries?: number;
  now?: () => number;
}

export function createTtlMemo({ ttlMs, maxEntries = 100, now = Date.now }: TtlMemoOptions) {
  const entries = new Map<string, { expiresAt: number; value: Promise<unknown> }>();

  return {
    get size() {
      return entries.size;
    },
    clear() {
      entries.clear();
    },
    async run<T>(key: string, produce: () => Promise<T>): Promise<T> {
      const current = entries.get(key);
      if (current && current.expiresAt > now()) return current.value as Promise<T>;

      const value = produce();
      entries.delete(key);
      entries.set(key, { expiresAt: now() + ttlMs, value });
      // Oldest first (a Map keeps insertion order).
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
      try {
        return await value;
      } catch (error) {
        // Forget a failure, but only if the entry is still this one (a newer call may have replaced it).
        if (entries.get(key)?.value === value) entries.delete(key);
        throw error;
      }
    },
  };
}
