/**
 * Cloudflare Workers entry for the API. The same application as the Node server (server/main.ts): GraphQL,
 * payment webhooks, health and readiness, and the background jobs, which run from a Cron Trigger (once per
 * schedule, not once per instance).
 *
 * Workers cannot share a database connection between requests, so each request (and each cron run) opens one
 * connection through Hyperdrive, which pools the real PostgreSQL connections. The application is built once
 * per isolate against a `Database` proxy that forwards to the current request's connection.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Database } from '@bambino/database';
import { connectOnce } from '@bambino/database/postgres';
import { createErrorReporter } from '@bambino/utils';
import { createPortableArgon2Hasher } from './auth/passwords-portable';
import { type Env, loadEnv } from './config/env';
import { createLogger } from './infra/logger';
import { MemoryRateLimiter, PostgresRateLimiter } from './infra/rate-limiter';
import { createEmailProvider } from './providers/email-factory';
import { MockPaymentProvider, type PaymentProvider } from './providers/payments';
import { createStorageProvider } from './providers/storage-factory';
import { SCHEMA_SDL } from './graphql/schema-sdl.generated';
import { type App, createApp } from './server/app';

interface WorkerBindings {
  /** Hyperdrive in front of the production PostgreSQL (wrangler.jsonc). */
  HYPERDRIVE?: { connectionString: string };
  [key: string]: unknown;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

const current = new AsyncLocalStorage<Database>();

/** A Database whose every use goes to the connection of the request being handled. */
const requestDatabase = new Proxy({} as Database, {
  get(_target, property) {
    const db = current.getStore();
    if (!db) throw new Error('No database connection for this request');
    const value = Reflect.get(db, property, db) as unknown;
    return typeof value === 'function' ? value.bind(db) : value;
  },
});

let built: { app: App; env: Env; connectionString: string } | null = null;

function build(bindings: WorkerBindings) {
  if (built) return built;
  // Plain-text vars and secrets arrive as strings on the bindings object.
  const strings = Object.fromEntries(
    Object.entries(bindings).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
  const connectionString = bindings.HYPERDRIVE?.connectionString ?? strings.DATABASE_URL ?? '';
  const env = loadEnv({ ...strings, DATABASE_URL: connectionString });
  const logger = createLogger(env.LOG_LEVEL, (line) => console.log(line));
  const app = createApp({
    config: {
      nodeEnv: env.NODE_ENV,
      marketCode: env.MARKET_CODE,
      webOrigin: env.WEB_ORIGIN,
      adminOrigin: env.ADMIN_ORIGIN,
      jwtSecret: env.JWT_SECRET,
      accessTokenTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
      refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
      trustProxy: false,
    },
    db: requestDatabase,
    typeDefs: SCHEMA_SDL,
    logger,
    email: createEmailProvider(env, logger),
    hasher: createPortableArgon2Hasher(),
    // Isolates do not share memory: limits must live in the database to mean anything.
    rateLimiter:
      env.RATE_LIMITER === 'memory' ? new MemoryRateLimiter() : new PostgresRateLimiter(requestDatabase),
    paymentProviders: new Map<PaymentProvider['code'], PaymentProvider>(
      env.PAYMENT_PROVIDERS_ENABLED.includes('mock')
        ? [
            [
              'MOCK',
              new MockPaymentProvider(
                env.MOCK_PAYMENT_WEBHOOK_SECRET,
                env.PAYMENT_EXPIRY_MINUTES,
                () => new Date(),
              ),
            ],
          ]
        : [],
    ),
    allowMockPayments: env.NODE_ENV !== 'production' && env.PAYMENT_PROVIDERS_ENABLED.includes('mock'),
    storage: createStorageProvider(env),
    errorReporter: createErrorReporter({
      dsn: env.SENTRY_DSN,
      app: 'api',
      environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    }),
  });
  built = { app, env, connectionString };
  return built;
}

/** Runs one unit of work with its own database connection, closed afterwards. */
async function withDatabase<T>(connectionString: string, context: ExecutionContext, work: () => Promise<T>) {
  const connection = await connectOnce(connectionString);
  try {
    return await current.run(connection.db, work);
  } finally {
    context.waitUntil(connection.close());
  }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export default {
  async fetch(request: Request, bindings: WorkerBindings, context: ExecutionContext): Promise<Response> {
    const { app, connectionString } = build(bindings);
    const { pathname } = new URL(request.url);
    if (pathname === '/health' && request.method === 'GET') return json(200, { status: 'ok' });
    return withDatabase(connectionString, context, async () => {
      if (pathname === '/ready' && request.method === 'GET') {
        const ready = await app.checkReady();
        return json(ready.status, ready.body);
      }
      if (pathname.startsWith('/webhooks/')) return app.handleWebhook(request);
      // Cloudflare sets CF-Connecting-IP at its edge; a client cannot forge it through Cloudflare.
      const clientIp = request.headers.get('cf-connecting-ip') ?? undefined;
      const response = await app.yoga.fetch(request, clientIp ? { clientIp } : {});
      // API answers are personal: never cached by Cloudflare or browsers.
      const headers = new Headers(response.headers);
      headers.set('cache-control', 'no-store');
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    });
  },

  /** Cron Trigger: reconciliation, renewals, cleanup, privacy requests and rate limit pruning, once per schedule. */
  async scheduled(_controller: unknown, bindings: WorkerBindings, context: ExecutionContext): Promise<void> {
    const { app, connectionString } = build(bindings);
    await withDatabase(connectionString, context, async () => {
      try {
        const result = await app.runJobs();
        console.log(JSON.stringify({ level: 'info', message: 'background jobs ran', ...result }));
      } catch (error) {
        console.log(JSON.stringify({ level: 'error', message: 'background jobs failed' }));
        await app.errorReporter.report(error, { source: 'job' });
        throw error;
      }
    });
  },
};
