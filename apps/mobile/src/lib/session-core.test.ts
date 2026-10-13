import { describe, expect, it } from 'vitest';
import { createMobileSession } from './session-core';

const USER = {
  id: 'u1',
  email: 'a@b.test',
  emailVerified: true,
  phone: null,
  firstName: 'A',
  lastName: 'B',
  preferredLocale: 'en',
  roles: [],
  permissions: [],
  addresses: [],
};

function memoryStore(initial: string | null = null) {
  let value = initial;
  return {
    get: async () => value,
    set: async (next: string | null) => {
      value = next;
    },
    peek: () => value,
  };
}

/** A fake GraphQL endpoint. `handlers` answers by operation name; every request is recorded. */
type Variables = Record<string, unknown>;

function fakeApi(handlers: Record<string, (variables: Variables, headers: Headers) => unknown>) {
  const calls: { op: string; variables: Variables; authorization: string | null }[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { operationName: string; variables: unknown };
    const headers = new Headers(init.headers);
    calls.push({
      op: body.operationName,
      variables: body.variables,
      authorization: headers.get('authorization'),
    });
    const handler = handlers[body.operationName];
    const result = handler
      ? handler(body.variables, headers)
      : { errors: [{ message: 'unhandled', extensions: { code: 'INTERNAL' } }] };
    return new Response(JSON.stringify(result), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const payload = (access: string, refresh: string) => ({
  data: {
    login: { user: USER, accessToken: access, accessTokenExpiresAt: 'x', refreshToken: refresh },
    refreshSession: { user: USER, accessToken: access, accessTokenExpiresAt: 'x', refreshToken: refresh },
  },
});

describe('mobile session', () => {
  it('keeps the refresh token in the store and the access token in memory after sign-in', async () => {
    const store = memoryStore();
    const { fetchImpl, calls } = fakeApi({
      Login: () => payload('access-1', 'refresh-1'),
      Me: () => ({ data: { me: USER } }),
    });
    const session = createMobileSession({ url: 'http://api.test/graphql', store, fetch: fetchImpl });

    await session.signIn('a@b.test', 'correct horse battery');
    expect(store.peek()).toBe('refresh-1');

    await session.api.request((await import('@bambino/api-client')).MeQuery);
    expect(calls.at(-1)?.authorization).toBe('Bearer access-1');
  });

  it('restores from the stored refresh token and stores the rotated one', async () => {
    const store = memoryStore('refresh-old');
    const { fetchImpl, calls } = fakeApi({
      RefreshSession: () => payload('access-2', 'refresh-new'),
      Me: () => ({ data: { me: USER } }),
    });
    const session = createMobileSession({ url: 'http://api.test/graphql', store, fetch: fetchImpl });

    expect((await session.restore())?.id).toBe('u1');
    expect(calls[0]?.variables).toEqual({ refreshToken: 'refresh-old' });
    expect(store.peek()).toBe('refresh-new');
  });

  it('returns null without calling the API when there is no stored token', async () => {
    const { fetchImpl, calls } = fakeApi({});
    const session = createMobileSession({
      url: 'http://api.test/graphql',
      store: memoryStore(),
      fetch: fetchImpl,
    });
    expect(await session.restore()).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('clears the stored token when the server says the session is gone, but keeps it on a network failure', async () => {
    const gone = memoryStore('refresh-old');
    const { fetchImpl } = fakeApi({
      RefreshSession: () => ({ errors: [{ message: 'no', extensions: { code: 'UNAUTHENTICATED' } }] }),
    });
    expect(
      await createMobileSession({ url: 'http://x/graphql', store: gone, fetch: fetchImpl }).restore(),
    ).toBeNull();
    expect(gone.peek()).toBeNull();

    const offline = memoryStore('refresh-old');
    const failing = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(
      await createMobileSession({ url: 'http://x/graphql', store: offline, fetch: failing }).restore(),
    ).toBeNull();
    expect(offline.peek()).toBe('refresh-old');
  });

  it('renews once and retries when an access token has expired, even for concurrent requests', async () => {
    const store = memoryStore('refresh-old');
    let renewals = 0;
    const { fetchImpl } = fakeApi({
      Me: (_v, headers) =>
        headers.get('authorization') === 'Bearer fresh'
          ? { data: { me: USER } }
          : { errors: [{ message: 'expired', extensions: { code: 'UNAUTHENTICATED' } }] },
      RefreshSession: () => {
        renewals += 1;
        return payload('fresh', 'refresh-new');
      },
    });
    const session = createMobileSession({ url: 'http://api.test/graphql', store, fetch: fetchImpl });
    const { MeQuery } = await import('@bambino/api-client');

    const results = await Promise.all([session.api.request(MeQuery), session.api.request(MeQuery)]);
    expect(results.map((r) => r.me?.id)).toEqual(['u1', 'u1']);
    expect(renewals).toBe(1);
  });

  it('signs out locally even when the server cannot be reached', async () => {
    const store = memoryStore('refresh-1');
    const failing = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    await createMobileSession({ url: 'http://x/graphql', store, fetch: failing }).signOut();
    expect(store.peek()).toBeNull();
  });
});
