import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Database } from '@bambino/database';
import { NoSchemaIntrospectionCustomRule, type ValidationRule } from 'graphql';
import { createSchema, createYoga } from 'graphql-yoga';
import type { PasswordHasher } from '../auth/passwords';
import type { ClientKind, GraphQLContext } from '../graphql/context';
import { useErrorFormatting } from '../graphql/errors';
import { applyGuards } from '../graphql/guards';
import { DEFAULT_QUERY_LIMITS, type QueryLimits, queryLimitsRule } from '../graphql/limits';
import { loadTypeDefs } from '../graphql/load-schema';
import { circularResolvers } from '../graphql/circular-resolvers';
import { commerceResolvers } from '../graphql/commerce-resolvers';
import { createLoaders } from '../graphql/loaders';
import { resolvers } from '../graphql/resolvers';
import type { Logger } from '../infra/logger';
import { RATE_LIMITS, type RateLimiter } from '../infra/rate-limiter';
import type { EmailProvider } from '../providers/email';
import type { PaymentProviderRegistry } from '../providers/payments';
import type { StorageProvider } from '../providers/storage';
import { type Services, createServices } from '../services';
import { ANONYMOUS, type RequestMeta } from '../services/context';
import { ACCESS_COOKIE, CookieJar, parseCookies } from './cookies';

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  marketCode: string;
  webOrigin: string;
  adminOrigin: string;
  jwtSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
  trustProxy: boolean;
}

export interface AppDependencies {
  config: AppConfig;
  db: Database;
  logger: Logger;
  email: EmailProvider;
  hasher: PasswordHasher;
  rateLimiter: RateLimiter;
  now?: () => Date;
  queryLimits?: QueryLimits;
  paymentProviders?: PaymentProviderRegistry;
  /** True only outside production: lets checkout use the MOCK provider. */
  allowMockPayments?: boolean;
  storage?: StorageProvider;
}

export const GRAPHQL_PATH = '/graphql';
export const CLIENT_HEADER = 'x-bambino-client';
const MAX_BODY_BYTES = 100_000;
const MAX_WEBHOOK_BYTES = 64_000;
const WEBHOOK_PATH = /^\/webhooks\/payments\/([a-z_]+)$/;

interface ServerContext {
  req?: IncomingMessage;
  res?: ServerResponse;
}

/**
 * Builds the HTTP application without starting a listener, so tests drive the full
 * pipeline (CORS, CSRF rule, limits, auth, error formatting) through `fetch`.
 */
export function createApp(deps: AppDependencies) {
  const { config, logger } = deps;
  const now = deps.now ?? (() => new Date());
  const production = config.nodeEnv === 'production';

  const services: Services = createServices({
    db: deps.db,
    hasher: deps.hasher,
    email: deps.email,
    rateLimiter: deps.rateLimiter,
    logger,
    now,
    config,
    payments: {
      providers: deps.paymentProviders ?? new Map(),
      allowMockProvider: deps.allowMockPayments ?? false,
    },
    ...(deps.storage ? { storage: deps.storage } : {}),
  });

  const schema = createSchema<GraphQLContext>({
    typeDefs: loadTypeDefs(),
    resolvers: [resolvers, commerceResolvers, circularResolvers],
  });
  const coverage = applyGuards(schema);

  // Per-request values the response hooks need, keyed by the request object.
  const perRequest = new WeakMap<Request, { requestId: string; cookies: CookieJar }>();

  const clientIp = (request: Request, serverContext: ServerContext): string | null => {
    if (config.trustProxy) {
      const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
      if (forwarded) return forwarded;
    }
    return serverContext.req?.socket.remoteAddress ?? null;
  };

  const yoga = createYoga<ServerContext, GraphQLContext>({
    schema,
    graphqlEndpoint: GRAPHQL_PATH,
    landingPage: false,
    graphiql: !production,
    maskedErrors: false, // replaced by useErrorFormatting, which also attaches request ids
    batching: false,
    logging: false,
    cors: {
      origin: [config.webOrigin, config.adminOrigin],
      credentials: true,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['content-type', 'authorization', CLIENT_HEADER],
      exposedHeaders: ['x-request-id'],
    },
    plugins: [
      {
        async onRequest({ request, serverContext, endResponse, fetchAPI }) {
          const length = Number(request.headers.get('content-length') ?? 0);
          if (length > MAX_BODY_BYTES) {
            endResponse(new fetchAPI.Response('Payload too large', { status: 413 }));
            return;
          }
          const ip = clientIp(request, serverContext as ServerContext) ?? 'unknown';
          if (!(await deps.rateLimiter.consume(`request:${ip}`, RATE_LIMITS.request))) {
            endResponse(
              new fetchAPI.Response('Too many requests', { status: 429, headers: { 'retry-after': '60' } }),
            );
          }
        },
        onValidate({ addValidationRule }: { addValidationRule: (rule: ValidationRule) => void }) {
          addValidationRule(queryLimitsRule(deps.queryLimits ?? DEFAULT_QUERY_LIMITS));
          if (production) addValidationRule(NoSchemaIntrospectionCustomRule);
        },
        onResponse({ request, response }) {
          const state = perRequest.get(request);
          if (state) {
            response.headers.set('x-request-id', state.requestId);
            for (const cookie of state.cookies.setCookieHeaders)
              response.headers.append('set-cookie', cookie);
          }
          response.headers.set('cache-control', 'no-store');
          response.headers.set('x-content-type-options', 'nosniff');
          response.headers.set('referrer-policy', 'no-referrer');
          response.headers.set('x-frame-options', 'DENY');
          if (production) {
            response.headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
            response.headers.set('content-security-policy', "default-src 'none'; frame-ancestors 'none'");
          }
        },
      },
      useErrorFormatting(),
    ],
    context: async ({ request, ...serverContext }): Promise<GraphQLContext> => {
      const requestId = randomUUID();
      const meta: RequestMeta = {
        requestId,
        ipAddress: clientIp(request, serverContext),
        userAgent: request.headers.get('user-agent'),
      };
      const client: ClientKind = request.headers.get(CLIENT_HEADER) === 'web' ? 'web' : 'mobile';
      // Cookies are honoured only with the custom header, which a cross-site form or
      // image request cannot send: this is the CSRF defence for cookie sessions.
      const incoming =
        client === 'web' ? parseCookies(request.headers.get('cookie')) : new Map<string, string>();
      const cookies = new CookieJar(production, incoming);
      perRequest.set(request, { requestId, cookies });

      const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
      const token = bearer ?? incoming.get(ACCESS_COOKIE);
      let actor = ANONYMOUS;
      try {
        actor = await services.auth.authenticate(token);
      } catch (error) {
        logger.error('authentication lookup failed', { requestId, error });
      }

      return {
        actor,
        meta,
        services,
        client,
        cookies,
        logger: logger.child({ requestId }),
        marketCode: config.marketCode,
        loaders: createLoaders(services),
      };
    },
  });

  /** Payment provider callbacks: POST /webhooks/payments/<provider>. Answered without CORS or cookies. */
  const handleWebhook = async (request: Request): Promise<Response> => {
    const match = new URL(request.url).pathname.match(WEBHOOK_PATH);
    if (!match?.[1] || request.method !== 'POST') return new Response('Not found', { status: 404 });
    const body = await request.text();
    if (body.length > MAX_WEBHOOK_BYTES) return new Response('Payload too large', { status: 413 });
    try {
      const result = await services.payments.handleWebhook(match[1], request.headers, body);
      return new Response(null, { status: result.status });
    } catch (error) {
      logger.error('webhook handling failed', { provider: match[1], error });
      return new Response(null, { status: 500 });
    }
  };

  /** Background work, run on a timer by the server process: payment reconciliation and stale order cleanup. */
  const runJobs = async () => {
    const payments = await services.payments.reconcile();
    const refunds = await services.refunds.reconcile();
    const privacy = await services.privacy.processRequests();
    const rateLimitWindowsPruned = (await deps.rateLimiter.prune?.()) ?? 0;
    const cancelledOrders = await services.orders.cancelStaleOrders();
    const subscriptions = await services.subscriptions.runRenewals();
    return {
      ...payments,
      refundsChecked: refunds.checked,
      cancelledOrders,
      ...subscriptions,
      ...privacy,
      rateLimitWindowsPruned,
    };
  };

  /** Node request handler: health check, webhooks, and the GraphQL endpoint. */
  const handler = (req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (req.url?.startsWith('/webhooks/')) {
      void forwardToFetchHandler(req, res, handleWebhook, MAX_WEBHOOK_BYTES);
      return;
    }
    void yoga(req, res, { req, res });
  };

  return { yoga, handler, handleWebhook, runJobs, services, coverage };
}

export type App = ReturnType<typeof createApp>;

/** Adapts a Node request to a fetch-style handler, refusing bodies over the limit. */
async function forwardToFetchHandler(
  req: IncomingMessage,
  res: ServerResponse,
  handle: (request: Request) => Promise<Response>,
  maxBytes: number,
): Promise<void> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > maxBytes) {
      res.writeHead(413).end();
      return;
    }
    chunks.push(chunk as Buffer);
  }
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value);
  }
  const response = await handle(
    new Request(`http://internal${req.url ?? '/'}`, {
      method: req.method ?? 'GET',
      headers,
      ...(req.method === 'POST' ? { body: Buffer.concat(chunks).toString('utf8') } : {}),
    }),
  );
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(await response.text());
}
