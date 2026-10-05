import type { ErrorReporter } from '@bambino/utils';
import { LEGAL_DOCUMENT_VERSIONS } from '@bambino/config';
import {
  grantRole,
  seedDevelopmentCatalogue,
  seedDevelopmentReference,
  seedSystem,
} from '@bambino/database/seeds';
import { createTestDatabase } from '@bambino/database/testing';
import type { RoleKey } from '@bambino/types';
import { MockPaymentProvider } from '../providers/payments';
import { FakeStorageProvider } from './fake-storage';
import { createArgon2Hasher } from '../auth/passwords';
import { silentLogger } from '../infra/logger';
import { type RateLimiter, unlimitedRateLimiter } from '../infra/rate-limiter';
import { MemoryEmailProvider } from '../providers/email';
import { CLIENT_HEADER, GRAPHQL_PATH, createApp } from '../server/app';
import type { QueryLimits } from '../graphql/limits';

export const TEST_CONFIG = {
  nodeEnv: 'test' as const,
  marketCode: 'RW',
  webOrigin: 'http://web.test',
  adminOrigin: 'http://admin.test',
  jwtSecret: 'test-secret-that-is-at-least-32-characters-long',
  accessTokenTtlSeconds: 900,
  refreshTokenTtlDays: 30,
  trustProxy: false,
};

export const PASSWORD = 'a-long-test-password';
export const MOCK_WEBHOOK_SECRET = 'test-mock-webhook-secret';

export const CONSENTS = (['TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'CHILD_DATA_PROCESSING'] as const).map(
  (type) => ({
    type,
    documentVersion: LEGAL_DOCUMENT_VERSIONS[type],
    granted: true,
  }),
);

export interface GqlOptions {
  token?: string;
  client?: 'web' | 'mobile';
  cookie?: string;
  headers?: Record<string, string>;
}

export interface GqlResponse {
  status: number;
  headers: Headers;
  data: Record<string, unknown> | null | undefined;
  errors: { message: string; extensions?: Record<string, unknown> }[] | undefined;
}

let sequence = 0;

/** A fresh database, seeded roles, and the real app with fast hashing and an adjustable clock. */
export async function createTestApp(
  options: {
    rateLimiter?: RateLimiter;
    queryLimits?: QueryLimits;
    catalogue?: boolean;
    errorReporter?: ErrorReporter;
  } = {},
) {
  const { db, close } = await createTestDatabase();
  await seedSystem(db);
  if (options.catalogue) {
    await seedDevelopmentReference(db);
    await seedDevelopmentCatalogue(db);
  }
  const email = new MemoryEmailProvider();
  let clock = new Date('2026-10-01T08:00:00Z');
  const mockPayments = new MockPaymentProvider(MOCK_WEBHOOK_SECRET, 10, () => clock);
  const storage = new FakeStorageProvider();

  const app = createApp({
    config: TEST_CONFIG,
    db,
    logger: silentLogger,
    email,
    hasher: createArgon2Hasher({ memoryCost: 1024, timeCost: 1 }),
    rateLimiter: options.rateLimiter ?? unlimitedRateLimiter,
    now: () => clock,
    ...(options.queryLimits ? { queryLimits: options.queryLimits } : {}),
    paymentProviders: new Map([['MOCK', mockPayments]]),
    allowMockPayments: true,
    storage,
    ...(options.errorReporter ? { errorReporter: options.errorReporter } : {}),
  });

  async function gql(
    query: string,
    variables: Record<string, unknown> = {},
    opts: GqlOptions = {},
  ): Promise<GqlResponse> {
    const headers: Record<string, string> = { 'content-type': 'application/json', ...opts.headers };
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    if (opts.client) headers[CLIENT_HEADER] = opts.client;
    if (opts.cookie) headers.cookie = opts.cookie;
    const response = await app.yoga.fetch(`http://api.test${GRAPHQL_PATH}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    });
    const body = (await response.json()) as Pick<GqlResponse, 'data' | 'errors'>;
    return { status: response.status, headers: response.headers, data: body.data, errors: body.errors };
  }

  /** Registers a customer through the API (mobile client) and returns its tokens. */
  async function registerCustomer(overrides: Record<string, unknown> = {}) {
    const email = `parent${++sequence}@seed.test`;
    const response = await gql(REGISTER, {
      input: {
        email,
        password: PASSWORD,
        firstName: 'Seed',
        lastName: 'Parent',
        consents: CONSENTS,
        ...overrides,
      },
    });
    const payload = response.data?.register as
      { accessToken: string; refreshToken: string; user: { id: string } } | undefined;
    if (!payload) throw new Error(`registration failed: ${JSON.stringify(response.errors)}`);
    return {
      email,
      userId: payload.user.id,
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken,
    };
  }

  async function registerStaff(role: RoleKey) {
    const account = await registerCustomer();
    await grantRole(db, account.userId, role);
    return account;
  }

  return {
    app,
    db,
    email,
    mockPayments,
    storage,
    gql,
    registerCustomer,
    registerStaff,
    advanceClock: (ms: number) => {
      clock = new Date(clock.getTime() + ms);
    },
    close,
  };
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;

export const AUTH_FIELDS =
  'accessToken accessTokenExpiresAt refreshToken user { id email emailVerified firstName roles permissions }';
export const REGISTER = `mutation ($input: RegisterInput!) { register(input: $input) { ${AUTH_FIELDS} } }`;
export const LOGIN = `mutation ($input: LoginInput!) { login(input: $input) { ${AUTH_FIELDS} } }`;
export const REFRESH = `mutation ($token: String) { refreshSession(refreshToken: $token) { ${AUTH_FIELDS} } }`;
export const ME =
  '{ me { id email emailVerified firstName lastName roles permissions addresses { id isDefault } } }';

export function errorCode(response: GqlResponse): unknown {
  return response.errors?.[0]?.extensions?.code;
}

export function errorReason(response: GqlResponse): unknown {
  return response.errors?.[0]?.extensions?.reason;
}
