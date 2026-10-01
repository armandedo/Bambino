/**
 * A small fetch-based GraphQL client shared by the web and mobile apps. Operations carry their result and
 * variable types, so a call site cannot pass the wrong variables or misread the result.
 */

export interface TypedOperation<TData, TVariables> {
  readonly name: string;
  readonly document: string;
  /** Type-only markers; never set at runtime. */
  readonly __data?: TData;
  readonly __variables?: TVariables;
}

/** Variables and result types of an operation, for forms and helpers built around it. */
export type VariablesOf<T> = T extends TypedOperation<unknown, infer V> ? V : never;
export type DataOf<T> = T extends TypedOperation<infer D, unknown> ? D : never;

export function operation<TData, TVariables = Record<never, never>>(
  name: string,
  document: string,
): TypedOperation<TData, TVariables> {
  return { name, document };
}

/** Codes the API puts in `extensions.code` (see apps/api/src/graphql/errors.ts). */
export type ApiErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'BAD_USER_INPUT'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'NOT_IMPLEMENTED'
  | 'INTERNAL'
  | 'NETWORK';

export interface FieldError {
  path: string;
  /** Translation key, for example validation.password.too_short. */
  message: string;
}

export class ApiError extends Error {
  override readonly name = 'ApiError';

  constructor(
    message: string,
    readonly code: ApiErrorCode | (string & {}),
    readonly requestId: string | undefined,
    readonly fieldErrors: readonly FieldError[] = [],
  ) {
    super(message);
  }
}

export interface ClientOptions {
  /** Full GraphQL endpoint, for example http://127.0.0.1:4000/graphql. */
  url: string;
  /** `web` sends cookies with the CSRF header; `mobile` sends a bearer token. */
  client: 'web' | 'mobile' | 'server';
  getAccessToken?: () => string | null | undefined;
  fetch?: typeof fetch;
  /** Extra init for every request, for example Next.js `{ next: { revalidate: 60 } }`. */
  init?: RequestInit & Record<string, unknown>;
  /**
   * Called once when an operation fails with UNAUTHENTICATED (usually an expired access token). Return true
   * after renewing the session and the operation is retried once. Not called for the auth operations themselves.
   */
  onUnauthenticated?: () => Promise<boolean>;
}

/** Operations that must never trigger a refresh-and-retry, or a failed refresh would loop. */
const NO_RETRY = new Set(['Login', 'Register', 'RefreshSession', 'Logout']);

interface GraphQLResponse<TData> {
  data?: TData | null;
  errors?: {
    message: string;
    extensions?: { code?: string; requestId?: string; fieldErrors?: FieldError[] };
  }[];
}

export interface GraphQLClient {
  request<TData, TVariables>(
    op: TypedOperation<TData, TVariables>,
    ...variables: keyof TVariables extends never ? [] : [TVariables]
  ): Promise<TData>;
}

export function createClient(options: ClientOptions): GraphQLClient {
  const doFetch = options.fetch ?? fetch;
  async function send<TData>(op: TypedOperation<TData, unknown>, variables: unknown): Promise<TData> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json',
    };
    if (options.client === 'web') headers['x-bambino-client'] = 'web';
    const token = options.getAccessToken?.();
    if (token) headers.authorization = `Bearer ${token}`;

    let response: Response;
    try {
      response = await doFetch(options.url, {
        ...options.init,
        method: 'POST',
        headers,
        ...(options.client === 'web' ? { credentials: 'include' as const } : {}),
        body: JSON.stringify({ query: op.document, operationName: op.name, variables: variables ?? {} }),
      });
    } catch (cause) {
      throw new ApiError(
        `Could not reach the Bambino API (${cause instanceof Error ? cause.message : 'network error'}).`,
        'NETWORK',
        undefined,
      );
    }

    let body: GraphQLResponse<unknown>;
    try {
      body = (await response.json()) as GraphQLResponse<unknown>;
    } catch {
      throw new ApiError(`The API answered ${response.status} without a GraphQL body.`, 'NETWORK', undefined);
    }

    const first = body.errors?.[0];
    if (first) {
      throw new ApiError(
        first.message,
        first.extensions?.code ?? 'INTERNAL',
        first.extensions?.requestId,
        first.extensions?.fieldErrors ?? [],
      );
    }
    if (body.data === undefined || body.data === null) {
      throw new ApiError('The API returned no data.', 'INTERNAL', undefined);
    }
    return body.data as TData;
  }

  return {
    async request(op, ...rest) {
      try {
        return await send(op, rest[0]);
      } catch (error) {
        const retry =
          error instanceof ApiError &&
          error.code === 'UNAUTHENTICATED' &&
          options.onUnauthenticated !== undefined &&
          !NO_RETRY.has(op.name);
        if (!retry || !(await options.onUnauthenticated?.())) throw error;
        return send(op, rest[0]);
      }
    },
  };
}
