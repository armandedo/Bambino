import { describe, expect, it, vi } from 'vitest';
import { createBrowserSession } from './browser-session';
import { operation } from './client';

const Ping = operation<{ ping: string }>('Ping', 'query Ping { ping }');

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

const unauthenticated = () =>
  new Response(
    JSON.stringify({ data: null, errors: [{ message: 'Sign in', extensions: { code: 'UNAUTHENTICATED' } }] }),
  );

describe('createBrowserSession', () => {
  it('does not try to refresh for a visitor who never signed in', async () => {
    const fetch = vi.fn(async () => unauthenticated());
    const session = createBrowserSession({ url: 'u', fetch, storage: memoryStorage(), locks: null });
    expect(await session.renewSession()).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('collapses concurrent renewals into one refresh request', async () => {
    let refreshes = 0;
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { operationName: string };
      if (body.operationName === 'RefreshSession') {
        refreshes += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return new Response(JSON.stringify({ data: { refreshSession: { user: {} } } }));
      }
      return new Response(JSON.stringify({ data: { ping: 'pong' } }));
    });
    const session = createBrowserSession({ url: 'u', fetch, storage: memoryStorage(), locks: null });
    session.markSignedIn(true);
    const results = await Promise.all([
      session.renewSession(),
      session.renewSession(),
      session.renewSession(),
    ]);
    expect(results).toEqual([true, true, true]);
    expect(refreshes).toBe(1);
  });

  it('runs the refresh inside the cross-tab lock', async () => {
    const request = vi.fn(async (_name: string, callback: () => Promise<boolean>) => callback());
    const fetch = vi.fn(async () => new Response(JSON.stringify({ data: { refreshSession: { user: {} } } })));
    const session = createBrowserSession({
      url: 'u',
      name: 'admin',
      fetch,
      storage: memoryStorage(),
      locks: { request },
    });
    session.markSignedIn(true);
    await session.renewSession();
    expect(request).toHaveBeenCalledWith('admin-session-refresh', expect.any(Function));
  });

  it('clears the hint when the refresh fails, so later pages stop trying', async () => {
    const fetch = vi.fn(async () => unauthenticated());
    const storage = memoryStorage();
    const session = createBrowserSession({ url: 'u', fetch, storage, locks: null });
    session.markSignedIn(true);
    expect(await session.renewSession()).toBe(false);
    expect(session.probablySignedIn()).toBe(false);
    await expect(session.api.request(Ping)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});
