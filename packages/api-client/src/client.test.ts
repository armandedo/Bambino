import { describe, expect, it, vi } from 'vitest';
import { ApiError, createClient, operation } from './client';

const Ping = operation<{ ping: string }, { name: string }>(
  'Ping',
  'query Ping($name: String!) { ping(name: $name) }',
);

function respond(body: unknown, status = 200) {
  return vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify(body), { status }),
  );
}

describe('createClient', () => {
  it('posts the operation and returns data', async () => {
    const fetch = respond({ data: { ping: 'pong' } });
    const client = createClient({ url: 'http://api.test/graphql', client: 'server', fetch });
    await expect(client.request(Ping, { name: 'a' })).resolves.toEqual({ ping: 'pong' });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('http://api.test/graphql');
    expect(JSON.parse(init?.body as string)).toEqual({
      query: Ping.document,
      operationName: 'Ping',
      variables: { name: 'a' },
    });
    expect((init?.headers as Record<string, string>)['x-bambino-client']).toBeUndefined();
  });

  it('web clients send the CSRF header and cookies; mobile clients send a bearer token', async () => {
    const webFetch = respond({ data: { ping: 'x' } });
    await createClient({ url: 'u', client: 'web', fetch: webFetch }).request(Ping, { name: 'a' });
    const webInit = webFetch.mock.calls[0]?.[1];
    expect((webInit?.headers as Record<string, string>)['x-bambino-client']).toBe('web');
    expect(webInit?.credentials).toBe('include');

    const mobileFetch = respond({ data: { ping: 'x' } });
    await createClient({
      url: 'u',
      client: 'mobile',
      fetch: mobileFetch,
      getAccessToken: () => 'tok',
    }).request(Ping, {
      name: 'a',
    });
    const mobileInit = mobileFetch.mock.calls[0]?.[1];
    expect((mobileInit?.headers as Record<string, string>).authorization).toBe('Bearer tok');
  });

  it('turns GraphQL errors into ApiError with code and request id', async () => {
    const fetch = respond({
      data: null,
      errors: [{ message: 'Nope', extensions: { code: 'FORBIDDEN', requestId: 'req-1' } }],
    });
    const error = await createClient({ url: 'u', client: 'server', fetch })
      .request(Ping, { name: 'a' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'FORBIDDEN', requestId: 'req-1', message: 'Nope' });
  });

  it('reports an unreachable API as NETWORK', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(
      createClient({ url: 'u', client: 'server', fetch }).request(Ping, { name: 'a' }),
    ).rejects.toMatchObject({
      code: 'NETWORK',
    });
  });

  it('reports a non-GraphQL response as NETWORK', async () => {
    const fetch = vi.fn(async () => new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(
      createClient({ url: 'u', client: 'server', fetch }).request(Ping, { name: 'a' }),
    ).rejects.toMatchObject({
      code: 'NETWORK',
    });
  });

  it('renews the session once on UNAUTHENTICATED and retries', async () => {
    let calls = 0;
    const fetch = vi.fn(async () => {
      calls += 1;
      return new Response(
        JSON.stringify(
          calls === 1
            ? { data: null, errors: [{ message: 'Sign in', extensions: { code: 'UNAUTHENTICATED' } }] }
            : { data: { ping: 'again' } },
        ),
      );
    });
    const onUnauthenticated = vi.fn(async () => true);
    const client = createClient({ url: 'u', client: 'web', fetch, onUnauthenticated });
    await expect(client.request(Ping, { name: 'a' })).resolves.toEqual({ ping: 'again' });
    expect(onUnauthenticated).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry when renewal fails, or for auth operations', async () => {
    const unauthenticated = () =>
      respond({ data: null, errors: [{ message: 'Sign in', extensions: { code: 'UNAUTHENTICATED' } }] });
    const failing = vi.fn(async () => false);
    await expect(
      createClient({ url: 'u', client: 'web', fetch: unauthenticated(), onUnauthenticated: failing }).request(
        Ping,
        {
          name: 'a',
        },
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });

    const Login = operation<{ login: boolean }>('Login', 'mutation Login { login }');
    const never = vi.fn(async () => true);
    await expect(
      createClient({ url: 'u', client: 'web', fetch: unauthenticated(), onUnauthenticated: never }).request(
        Login,
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(never).not.toHaveBeenCalled();
  });
});
