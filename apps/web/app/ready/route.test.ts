import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

describe('readiness route', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is ready when the API is ready', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: URL) => {
      calls.push(String(url));
      return new Response('{}', { status: 200 });
    });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(calls[0]).toMatch(/\/ready$/);
  });

  it('is unavailable when the API is not ready or unreachable', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 503 }));
    expect((await GET()).status).toBe(503);
    vi.stubGlobal('fetch', async () => {
      throw new Error('ECONNREFUSED');
    });
    expect((await GET()).status).toBe(503);
  });
});
