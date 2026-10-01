import { LEGAL_DOCUMENT_VERSIONS } from '@bambino/config';
import { connectDatabase } from '@bambino/database/client';
import {
  grantRole,
  seedDevelopmentCatalogue,
  seedDevelopmentReference,
  seedSystem,
} from '@bambino/database/seeds';
import { createArgon2Hasher } from '../auth/passwords';
import { loadEnv } from '../config/env';
import { createLogger } from '../infra/logger';
import { unlimitedRateLimiter } from '../infra/rate-limiter';
import { ConsoleEmailProvider } from '../providers/email';
import { createServices } from '../services';
import { ANONYMOUS, type ServiceContext } from '../services/context';
import { AppError } from '../services/errors';
import { loadLocalEnvFile } from '../server/env-file';

/**
 * Roles and permissions always. In development also labelled reference data and,
 * when their passwords are provided, a seed admin and a seed customer. Passwords are
 * read from SEED_ADMIN_PASSWORD / SEED_CUSTOMER_PASSWORD and never stored in code.
 */
loadLocalEnvFile();
const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL);
const connection = connectDatabase(env.DATABASE_URL);

try {
  if (connection.driver === 'pglite') await connection.migrate();
  await seedSystem(connection.db);
  logger.info('seeded roles and permissions');

  if (env.NODE_ENV !== 'production') {
    await seedDevelopmentReference(connection.db);
    await seedDevelopmentCatalogue(connection.db);
    logger.info('seeded development reference data (labelled SEED)');

    const services = createServices({
      db: connection.db,
      hasher: createArgon2Hasher(),
      email: new ConsoleEmailProvider(logger),
      rateLimiter: unlimitedRateLimiter,
      logger,
      now: () => new Date(),
      config: {
        jwtSecret: env.JWT_SECRET,
        accessTokenTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
        refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
        webOrigin: env.WEB_ORIGIN,
        marketCode: env.MARKET_CODE,
      },
    });
    const context: ServiceContext = {
      actor: ANONYMOUS,
      meta: { requestId: 'seed', ipAddress: null, userAgent: 'seed' },
    };
    const consents = (['TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'CHILD_DATA_PROCESSING'] as const).map(
      (type) => ({
        type,
        documentVersion: LEGAL_DOCUMENT_VERSIONS[type],
        granted: true,
      }),
    );

    const accounts = [
      {
        email: 'admin@seed.test',
        password: process.env.SEED_ADMIN_PASSWORD,
        firstName: 'Seed',
        lastName: 'Admin',
        role: 'SUPER_ADMIN' as const,
      },
      {
        email: 'parent@seed.test',
        password: process.env.SEED_CUSTOMER_PASSWORD,
        firstName: 'Seed',
        lastName: 'Parent',
        role: null,
      },
    ];
    for (const account of accounts) {
      if (!account.password) {
        logger.info('skipped seed account: password variable not set', { email: account.email });
        continue;
      }
      try {
        const result = await services.auth.register(context, { ...account, consents });
        if (account.role) await grantRole(connection.db, result.userId, account.role);
        logger.info('created seed account', { email: account.email, role: account.role ?? 'CUSTOMER' });
      } catch (error) {
        if (error instanceof AppError && error.reason === 'EMAIL_IN_USE') {
          logger.info('seed account already exists', { email: account.email });
        } else {
          throw error;
        }
      }
    }
  }
} finally {
  await connection.close();
}
