import 'server-only';
import { ApiError, type GraphQLClient, type TypedOperation, createClient } from '@bambino/api-client';
import { createTtlMemo } from './ttl-memo';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4000/graphql';

/** Public, cacheable reads for server-rendered pages. Catalogue data is revalidated every minute. */
const publicClient: GraphQLClient = createClient({
  url: API_URL,
  client: 'server',
  init: { next: { revalidate: 60 } },
});

/**
 * The Cloudflare build has no Next.js data cache, so the `revalidate` above does not hold there. Public catalogue
 * answers are therefore also remembered in memory for a short time (see ttl-memo.ts). Thirty seconds is short
 * enough that a price or stock change shows up quickly, and checkout re-checks both on the server anyway.
 */
const memo = createTtlMemo({ ttlMs: 30_000, maxEntries: 100 });

export type Loaded<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/**
 * Runs a public query and returns the failure instead of throwing, so a page can show a proper error state
 * (with the request id) when the API is down rather than a blank crash.
 */
export async function load<TData, TVariables>(
  op: TypedOperation<TData, TVariables>,
  ...variables: keyof TVariables extends never ? [] : [TVariables]
): Promise<Loaded<TData>> {
  try {
    const key = `${op.name}:${JSON.stringify(variables[0] ?? null)}`;
    return { ok: true, data: await memo.run(key, () => publicClient.request(op, ...variables)) };
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, error };
    throw error;
  }
}
