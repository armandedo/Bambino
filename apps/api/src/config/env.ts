import { isMarketCode } from '@bambino/config';
import { z } from 'zod';

/** An empty value copied from .env.example means unset. */
const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    MARKET_CODE: z.string().default('RW').refine(isMarketCode, 'is not a configured market'),
    DATABASE_URL: z.string().min(1),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    WEB_ORIGIN: z.url(),
    ADMIN_ORIGIN: z.url(),
    JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    EMAIL_PROVIDER: z.enum(['console']).default('console'),
    EMAIL_FROM: z.string().min(3),
    TRUST_PROXY: booleanString.default(false),
    /** `memory` for one API instance (development, tests); `postgres` when several instances share limits. */
    RATE_LIMITER: z.enum(['memory', 'postgres']).default('memory'),
    /** Error tracking. Reports are sent only when set (see @bambino/utils error-reporter). */
    SENTRY_DSN: z.preprocess(emptyToUndefined, z.url().optional()),
    /** Shown on Sentry reports, e.g. production or staging. Defaults to NODE_ENV. */
    SENTRY_ENVIRONMENT: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
    /** Comma-separated. Only `mock` exists today; MTN MoMo and Airtel Money are not yet integrated. */
    PAYMENT_PROVIDERS_ENABLED: z
      .string()
      .default('mock')
      .transform((value) =>
        value
          .split(',')
          .map((entry) => entry.trim().toLowerCase())
          .filter(Boolean),
      )
      .pipe(
        z.array(
          z.enum(['mock'], 'only "mock" is available; MTN MoMo and Airtel Money are not yet integrated'),
        ),
      ),
    MOCK_PAYMENT_WEBHOOK_SECRET: z.string().min(16).default('development-mock-webhook-secret'),
    PAYMENT_EXPIRY_MINUTES: z.coerce.number().int().min(1).max(60).default(10),
    RECONCILE_INTERVAL_SECONDS: z.coerce.number().int().min(10).max(3600).default(60),
    STORAGE_PUBLIC_BASE_URL: z.url().default('http://localhost:4000/media'),
    /** `s3` for any S3-compatible service (the Docker RustFS, AWS S3, ...); `local` disables uploads. */
    STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
    STORAGE_ENDPOINT: z.url().optional(),
    STORAGE_REGION: z.string().min(1).default('us-east-1'),
    STORAGE_BUCKET: z.string().optional(),
    /**
     * A second, never-public bucket for private files (data exports). Cloudflare R2 can only make a whole bucket
     * public, not a prefix, so on R2 the public product-image bucket must not hold private files.
     */
    STORAGE_PRIVATE_BUCKET: z.string().optional(),
    STORAGE_ACCESS_KEY_ID: z.string().optional(),
    STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
  })
  .superRefine((env, context) => {
    const fail = (path: string, message: string) =>
      context.addIssue({ code: 'custom', path: [path], message });
    if (env.STORAGE_PROVIDER === 's3') {
      for (const key of [
        'STORAGE_ENDPOINT',
        'STORAGE_BUCKET',
        'STORAGE_ACCESS_KEY_ID',
        'STORAGE_SECRET_ACCESS_KEY',
      ] as const) {
        if (!env[key]) fail(key, 'is required when STORAGE_PROVIDER=s3');
      }
    }
    if (env.NODE_ENV !== 'production') return;
    if (env.PAYMENT_PROVIDERS_ENABLED.includes('mock')) {
      fail('PAYMENT_PROVIDERS_ENABLED', 'the mock payment provider cannot be enabled in production');
    }
    for (const [key, value] of Object.entries(env)) {
      if (typeof value === 'string' && value.includes('CHANGE_ME')) fail(key, 'still contains a placeholder');
    }
    if (!/^postgres(ql)?:\/\//.test(env.DATABASE_URL))
      fail('DATABASE_URL', 'must be a PostgreSQL server in production');
    if (env.EMAIL_PROVIDER === 'console')
      fail('EMAIL_PROVIDER', 'the console provider only logs emails; configure a real provider');
    for (const key of ['WEB_ORIGIN', 'ADMIN_ORIGIN'] as const) {
      if (!env[key].startsWith('https://')) fail(key, 'must use https in production');
    }
  });

export type Env = z.infer<typeof envSchema>;

export class EnvError extends Error {
  override readonly name = 'EnvError';
}

/**
 * Validates configuration at startup. The error lists variable names and problems
 * only, never values, so it is safe to print.
 */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    throw new EnvError(`Invalid configuration:\n${problems.join('\n')}`);
  }
  return result.data;
}
