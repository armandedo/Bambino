/**
 * Vercel entry for the API. The same application as the Node server (server/main.ts) and the Cloudflare Worker
 * (worker.ts): GraphQL, payment webhooks, health and readiness, and the background jobs.
 *
 * A Vercel function instance stays warm between requests, so it keeps one small connection pool, pointed at the
 * database's pooled endpoint (Neon's "-pooler" host). That replaces Hyperdrive.
 *
 * Nothing runs between requests here, so the background jobs (payment reconciliation, order expiry, cleanup,
 * privacy requests) run when Vercel Cron calls GET /internal/jobs. Vercel sends the project's CRON_SECRET as a
 * bearer token; without the right token the route does nothing.
 */
import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { connectPool } from '@bambino/database/postgres';
import { createErrorReporter } from '@bambino/utils';
import { createPortableArgon2Hasher } from './auth/passwords-portable';
import { loadEnv } from './config/env';
import { createLogger } from './infra/logger';
import { MemoryRateLimiter, PostgresRateLimiter } from './infra/rate-limiter';
import { createEmailProvider } from './providers/email-factory';
import { createPaymentProviders } from './providers/payment-factory';
import { createStorageProvider } from './providers/storage-factory';
import { SCHEMA_SDL } from './graphql/schema-sdl.generated';
import { type App, createApp } from './server/app';

export const JOBS_PATH = '/internal/jobs';

let app: App | null = null;

function build(): App {
  if (app) return app;
  const env = loadEnv(process.env);
  const logger = createLogger(env.LOG_LEVEL);
  const { db } = connectPool(env.DATABASE_URL);
  app = createApp({
    config: {
      nodeEnv: env.NODE_ENV,
      marketCode: env.MARKET_CODE,
      subscriptionsEnabled: env.SUBSCRIPTIONS_ENABLED,
      webOrigin: env.WEB_ORIGIN,
      adminOrigin: env.ADMIN_ORIGIN,
      jwtSecret: env.JWT_SECRET,
      accessTokenTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
      refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
      // Vercel's edge sets X-Forwarded-For itself; a client cannot supply its own through it.
      trustProxy: true,
    },
    db,
    typeDefs: SCHEMA_SDL,
    logger,
    email: createEmailProvider(env, logger),
    // Plain JavaScript, so the function bundle carries no native binary. Same hash format as the Node server.
    hasher: createPortableArgon2Hasher(),
    // Instances do not share memory: limits must live in the database to mean anything.
    rateLimiter: env.RATE_LIMITER === 'memory' ? new MemoryRateLimiter() : new PostgresRateLimiter(db),
    paymentProviders: createPaymentProviders(env),
    allowMockPayments: env.NODE_ENV !== 'production' && env.PAYMENT_PROVIDERS_ENABLED.includes('mock'),
    storage: createStorageProvider(env),
    errorReporter: createErrorReporter({
      dsn: env.SENTRY_DSN,
      app: 'api',
      environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    }),
  });
  return app;
}

/** True only for the exact bearer token; an unset or short secret authorises nobody. */
export function cronAuthorized(header: string | undefined, secret: string | undefined): boolean {
  if (!secret || secret.length < 16 || !header) return false;
  const given = Buffer.from(header);
  const wanted = Buffer.from(`Bearer ${secret}`);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};

async function runJobs(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!cronAuthorized(req.headers.authorization, process.env.CRON_SECRET))
    return json(res, 401, { status: 'unauthorized' });
  const current = build();
  try {
    const result = await current.runJobs();
    console.log(JSON.stringify({ level: 'info', message: 'background jobs ran', ...result }));
    json(res, 200, { status: 'ok', ...result });
  } catch (error) {
    console.log(JSON.stringify({ level: 'error', message: 'background jobs failed' }));
    await current.errorReporter.report(error, { source: 'job' });
    json(res, 500, { status: 'failed' });
  }
}

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  const path = (req.url ?? '/').split('?')[0];
  if (path === JOBS_PATH) {
    void runJobs(req, res);
    return;
  }
  // API answers are personal: never cached by Vercel's CDN or browsers.
  res.setHeader('cache-control', 'no-store');
  build().handler(req, res);
}
