import { describe, expect, it } from 'vitest';
import {
  SentryErrorReporter,
  createErrorReporter,
  noopErrorReporter,
  parseSentryDsn,
  scrub,
  scrubText,
} from './error-reporter';

const DSN = 'https://publickey123@o1.ingest.sentry.io/4501';

describe('scrubbing', () => {
  it('removes emails, phone numbers, bearer tokens and JWTs from text', () => {
    const text = scrubText(
      'User aline@example.rw (+250 788 123 456) sent Bearer abc.def-123 and eyJhbGciOi.eyJzdWIiOi.c2lnbmF0dXJl',
    );
    expect(text).not.toMatch(/aline@|788|abc\.def|eyJ/);
  });

  it('drops secret-looking keys anywhere in an object', () => {
    expect(
      scrub({
        cookie: 'a=b',
        headers: { Authorization: 'Bearer x', 'x-request-id': 'r1' },
        password: 'p',
        phone: '1',
      }),
    ).toEqual({
      cookie: '[redacted]',
      headers: { Authorization: '[redacted]', 'x-request-id': 'r1' },
      password: '[redacted]',
      phone: '[redacted]',
    });
  });
});

describe('SentryErrorReporter', () => {
  it('parses the DSN into the envelope endpoint', () => {
    expect(parseSentryDsn(DSN)).toEqual({
      envelopeUrl: 'https://o1.ingest.sentry.io/api/4501/envelope/',
      publicKey: 'publickey123',
    });
    expect(() => parseSentryDsn('https://o1.ingest.sentry.io/')).toThrow();
  });

  it('sends a scrubbed event with the request id, and nothing personal', async () => {
    const sent: { url: string; body: string; headers: Record<string, string> }[] = [];
    const reporter = new SentryErrorReporter({
      dsn: DSN,
      app: 'api',
      environment: 'production',
      fetch: (async (url: string, init: RequestInit) => {
        sent.push({ url, body: String(init.body), headers: init.headers as Record<string, string> });
        return new Response(null, { status: 200 });
      }) as typeof fetch,
    });
    await reporter.report(new Error('Payment failed for aline@example.rw on +250788123456'), {
      requestId: 'req-42',
      source: 'graphql',
      tags: { token: 'secret' },
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe('https://o1.ingest.sentry.io/api/4501/envelope/');
    expect(sent[0]?.headers['x-sentry-auth']).toContain('sentry_key=publickey123');
    const event = JSON.parse(sent[0]?.body.split('\n')[2] ?? '{}');
    expect(event.extra).toEqual({ requestId: 'req-42' });
    expect(event.tags).toMatchObject({ app: 'api', source: 'graphql', token: '[redacted]' });
    expect(sent[0]?.body).not.toMatch(/aline@|788123456|secret/);
  });

  it('never throws when Sentry is unreachable', async () => {
    const reporter = new SentryErrorReporter({
      dsn: DSN,
      app: 'web',
      environment: 'test',
      fetch: (async () => {
        throw new Error('offline');
      }) as typeof fetch,
    });
    await expect(reporter.report(new Error('x'))).resolves.toBeUndefined();
  });
});

describe('createErrorReporter', () => {
  it('reports nothing without a DSN', () => {
    expect(createErrorReporter({ app: 'api', environment: 'development' })).toBe(noopErrorReporter);
    expect(createErrorReporter({ dsn: DSN, app: 'api', environment: 'production' })).toBeInstanceOf(
      SentryErrorReporter,
    );
  });
});
