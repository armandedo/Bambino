import { noopErrorReporter } from '@bambino/utils';
import { GraphQLError } from 'graphql';
import { describe, expect, it } from 'vitest';
import { formatError } from '../graphql/errors';
import { createLogger } from '../infra/logger';
import { EnvError, loadEnv } from './env';

const development = {
  NODE_ENV: 'development',
  DATABASE_URL: 'pglite:memory',
  WEB_ORIGIN: 'http://localhost:3000',
  ADMIN_ORIGIN: 'http://localhost:3001',
  JWT_SECRET: 'x'.repeat(48),
  EMAIL_FROM: 'Bambino <no-reply@example.com>',
};

describe('environment validation', () => {
  it('accepts a development configuration and applies defaults', () => {
    const env = loadEnv(development);
    expect(env).toMatchObject({
      MARKET_CODE: 'RW',
      SUBSCRIPTIONS_ENABLED: false,
      API_PORT: 4000,
      ACCESS_TOKEN_TTL_SECONDS: 900,
      TRUST_PROXY: false,
    });
  });

  it('treats empty optional values copied from .env.example as unset, and checks a Sentry DSN is a URL', () => {
    expect(loadEnv({ ...development, SENTRY_DSN: '', SENTRY_ENVIRONMENT: '' }).SENTRY_DSN).toBeUndefined();
    expect(() => loadEnv({ ...development, SENTRY_DSN: 'not-a-url' })).toThrow(/SENTRY_DSN/);
  });

  it('names missing and weak values without printing them', () => {
    expect(() => loadEnv({ ...development, JWT_SECRET: 'short-secret-value' })).toThrow(
      /JWT_SECRET: must be at least 32/,
    );
    try {
      loadEnv({ ...development, JWT_SECRET: 'short-secret-value' });
    } catch (error) {
      expect(error).toBeInstanceOf(EnvError);
      expect(String(error)).not.toContain('short-secret-value');
    }
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });

  it('refuses to start production with placeholders, an in-process database, mocked email or plain http', () => {
    let message = '';
    try {
      loadEnv({ ...development, NODE_ENV: 'production', JWT_SECRET: `CHANGE_ME${'x'.repeat(40)}` });
    } catch (error) {
      message = String(error);
    }
    expect(message).toMatch(/JWT_SECRET: still contains a placeholder/);
    expect(message).toMatch(/DATABASE_URL: must be a PostgreSQL server/);
    expect(message).toMatch(/EMAIL_PROVIDER/);
    expect(message).toMatch(/WEB_ORIGIN: must use https/);
  });
});

describe('mock webhook secret', () => {
  it('has no built-in value, and refuses a short one', () => {
    expect(loadEnv(development).MOCK_PAYMENT_WEBHOOK_SECRET).toBeUndefined();
    expect(
      loadEnv({ ...development, MOCK_PAYMENT_WEBHOOK_SECRET: '' }).MOCK_PAYMENT_WEBHOOK_SECRET,
    ).toBeUndefined();
    expect(() => loadEnv({ ...development, MOCK_PAYMENT_WEBHOOK_SECRET: 'short' })).toThrow(
      /MOCK_PAYMENT_WEBHOOK_SECRET/,
    );
  });
});

describe('payment configuration in production', () => {
  const production = {
    ...development,
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:pass@db.example/bambino',
    WEB_ORIGIN: 'https://shop.example',
    ADMIN_ORIGIN: 'https://admin.example',
    EMAIL_PROVIDER: 'resend',
    RESEND_API_KEY: 'x'.repeat(20),
  };
  const momo = {
    PAYMENT_PROVIDERS_ENABLED: 'mtn_momo',
    MTN_MOMO_BASE_URL: 'https://proxy.momoapi.mtn.co.rw',
    MTN_MOMO_TARGET_ENVIRONMENT: 'mtnrwanda',
    MTN_MOMO_CURRENCY: 'RWF',
    MTN_MOMO_COLLECTION_SUBSCRIPTION_KEY: 'k',
    MTN_MOMO_COLLECTION_API_USER: 'u',
    MTN_MOMO_COLLECTION_API_KEY: 'p',
  };
  const problems = (source: Record<string, string>) => {
    try {
      loadEnv(source);
      return '';
    } catch (error) {
      return String(error);
    }
  };

  it('accepts a complete live MTN MoMo configuration', () => {
    expect(problems({ ...production, ...momo })).toBe('');
  });

  it('refuses the mock provider, no provider at all, and missing MTN credentials', () => {
    expect(problems({ ...production, PAYMENT_PROVIDERS_ENABLED: 'mock' })).toMatch(/mock payment provider/);
    expect(problems({ ...production, PAYMENT_PROVIDERS_ENABLED: '' })).toMatch(
      /no payment provider is enabled/,
    );
    expect(problems({ ...production, PAYMENT_PROVIDERS_ENABLED: 'mtn_momo' })).toMatch(
      /MTN_MOMO_COLLECTION_API_KEY: is required/,
    );
  });

  it('refuses sandbox settings and a currency other than the one orders are priced in', () => {
    expect(
      problems({ ...production, ...momo, MTN_MOMO_BASE_URL: 'https://sandbox.momodeveloper.mtn.com' }),
    ).toMatch(/MTN_MOMO_BASE_URL: the MTN sandbox cannot be used/);
    expect(problems({ ...production, ...momo, MTN_MOMO_TARGET_ENVIRONMENT: 'sandbox' })).toMatch(
      /MTN_MOMO_TARGET_ENVIRONMENT/,
    );
    expect(problems({ ...production, ...momo, MTN_MOMO_CURRENCY: 'EUR' })).toMatch(
      /MTN_MOMO_CURRENCY: must be RWF/,
    );
  });
});

describe('error formatting', () => {
  it('hides unexpected errors and logs them with the request id', () => {
    const lines: string[] = [];
    const logger = createLogger('error', (line) => lines.push(line));
    const context = { meta: { requestId: 'req-1' }, logger, errorReporter: noopErrorReporter } as never;
    const leaked = new GraphQLError('db password is hunter2', {
      originalError: new Error('db password is hunter2'),
    });
    const formatted = formatError(leaked, context);
    expect(formatted.message).toBe('Something went wrong. Please try again.');
    expect(formatted.extensions).toEqual({ code: 'INTERNAL', requestId: 'req-1' });
    expect(lines.join('')).toContain('req-1');
  });
});

describe('logger', () => {
  it('redacts secrets at any depth', () => {
    const lines: string[] = [];
    createLogger('info', (line) => lines.push(line)).info('event', {
      password: 'p',
      nested: { refreshToken: 't', authorization: 'Bearer x', ok: 'visible' },
    });
    const entry = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
    expect(entry.password).toBe('[REDACTED]');
    expect(entry.nested).toEqual({ refreshToken: '[REDACTED]', authorization: '[REDACTED]', ok: 'visible' });
  });
});
