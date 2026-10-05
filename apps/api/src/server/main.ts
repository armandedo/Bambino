import { createServer } from 'node:http';
import { connectDatabase } from '@bambino/database/client';
import { createArgon2Hasher } from '../auth/passwords';
import { loadEnv } from '../config/env';
import { createLogger } from '../infra/logger';
import { MemoryRateLimiter } from '../infra/rate-limiter';
import { ConsoleEmailProvider } from '../providers/email';
import { MockPaymentProvider, type PaymentProvider } from '../providers/payments';
import { createStorageProvider } from '../providers/storage-factory';
import { createApp } from './app';
import { loadLocalEnvFile } from './env-file';

async function main() {
  loadLocalEnvFile();
  const env = loadEnv();
  const logger = createLogger(env.LOG_LEVEL);
  const connection = connectDatabase(env.DATABASE_URL);

  // An in-process development database is migrated on start. A real server is
  // migrated explicitly (pnpm db:migrate) so schema changes are a deliberate step.
  if (connection.driver === 'pglite') await connection.migrate();

  const app = createApp({
    config: {
      nodeEnv: env.NODE_ENV,
      marketCode: env.MARKET_CODE,
      webOrigin: env.WEB_ORIGIN,
      adminOrigin: env.ADMIN_ORIGIN,
      jwtSecret: env.JWT_SECRET,
      accessTokenTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
      refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
      trustProxy: env.TRUST_PROXY,
    },
    db: connection.db,
    logger,
    email: new ConsoleEmailProvider(logger),
    hasher: createArgon2Hasher(),
    rateLimiter: new MemoryRateLimiter(),
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
  });

  // Single-instance scheduler for the MVP; moves to a PostgreSQL-backed queue (pg-boss) in Phase 5.
  const jobs = setInterval(() => {
    app
      .runJobs()
      .then((result) => {
        if (
          result.checked ||
          result.refundsChecked ||
          result.cancelledOrders ||
          result.exported ||
          result.deleted
        )
          logger.info('background jobs ran', result);
      })
      .catch((error: unknown) => logger.error('background jobs failed', { error }));
  }, env.RECONCILE_INTERVAL_SECONDS * 1000);

  const server = createServer(app.handler);
  server.listen(env.API_PORT, () => {
    logger.info('api listening', {
      port: env.API_PORT,
      database: connection.driver,
      storage: env.STORAGE_PROVIDER,
      operationsImplemented: app.coverage.implemented.length,
      operationsNotImplemented: app.coverage.notImplemented.length,
    });
  });

  const shutdown = (signal: string) => {
    logger.info('shutting down', { signal });
    clearInterval(jobs);
    server.close(() => {
      void connection.close().finally(() => process.exit(0));
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  // Configuration errors list names, never values, so printing them is safe.
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
