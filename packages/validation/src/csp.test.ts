import { afterEach, describe, expect, it, vi } from 'vitest';

/** Replaces `Function` with one that records and refuses construction, as a strict CSP does. */
function blockEval(): unknown[] {
  const attempts: unknown[] = [];
  vi.stubGlobal(
    'Function',
    new Proxy(Function, {
      construct(_target, args) {
        attempts.push(args);
        throw new EvalError('blocked by CSP');
      },
    }),
  );
  return attempts;
}

describe('strict CSP support', () => {
  afterEach(async () => {
    vi.unstubAllGlobals();
    // Zod keeps its config on globalThis, which outlives the module reset.
    (await import('zod')).z.config({ jitless: false });
    vi.resetModules();
  });

  it('in a browser, builds and parses the schemas without trying to build a function from a string', async () => {
    vi.stubGlobal('window', {});
    const attempts = blockEval();
    const { emailSchema } = await import('./index');
    const { z } = await import('zod');
    expect(z.object({ email: emailSchema }).parse({ email: 'aline@example.rw' })).toEqual({
      email: 'aline@example.rw',
    });
    expect(attempts).toEqual([]);
  });

  it('on the server, keeps Zod’s compiled fast path', async () => {
    const { z } = await import('zod');
    await import('./index');
    expect(z.config().jitless).not.toBe(true);
  });
});
