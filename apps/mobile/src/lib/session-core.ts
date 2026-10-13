import {
  type AuthPayload,
  ApiError,
  type GraphQLClient,
  LoginMutation,
  LogoutMutation,
  MeQuery,
  RefreshSessionMutation,
  RegisterMutation,
  type VariablesOf,
  type Viewer,
  createClient,
} from '@bambino/api-client';

/** Where the long-lived refresh token is kept: the device keystore in the app, memory in tests. */
export interface TokenStore {
  get(): Promise<string | null>;
  set(token: string | null): Promise<void>;
}

export interface MobileSessionOptions {
  url: string;
  store: TokenStore;
  fetch?: typeof fetch;
}

export type RegisterInput = VariablesOf<typeof RegisterMutation>['input'];

export interface MobileSession {
  api: GraphQLClient;
  /** Signs in again from the stored refresh token. Resolves to the user, or null when signed out. */
  restore(): Promise<Viewer | null>;
  signIn(email: string, password: string): Promise<Viewer>;
  register(input: RegisterInput): Promise<Viewer>;
  signOut(): Promise<void>;
}

/**
 * Token handling for the app, following docs/03 section 3.1 for mobile: the API puts both tokens in the response
 * body, the refresh token goes to the keystore, the short-lived access token stays in memory only.
 *
 * The API rotates the refresh token on every use and treats a reused one as theft, so renewals are one at a
 * time: concurrent callers share a single in-flight request.
 */
export function createMobileSession(options: MobileSessionOptions): MobileSession {
  const { store } = options;
  let accessToken: string | null = null;
  let renewing: Promise<boolean> | null = null;

  const api = createClient({
    url: options.url,
    client: 'mobile',
    ...(options.fetch ? { fetch: options.fetch } : {}),
    getAccessToken: () => accessToken,
    onUnauthenticated: () => renew(),
  });

  async function adopt(payload: AuthPayload): Promise<Viewer> {
    accessToken = payload.accessToken;
    // The new refresh token replaces the old one before anything else happens: the old one is now dead.
    if (payload.refreshToken) await store.set(payload.refreshToken);
    return payload.user;
  }

  function renew(): Promise<boolean> {
    if (renewing) return renewing;
    renewing = (async () => {
      const token = await store.get();
      if (!token) return false;
      try {
        const { refreshSession } = await api.request(RefreshSessionMutation, { refreshToken: token });
        await adopt(refreshSession);
        return true;
      } catch (error) {
        // Only a definite "this session is gone" clears the token; a network failure keeps it for next time.
        if (error instanceof ApiError && error.code === 'UNAUTHENTICATED') {
          accessToken = null;
          await store.set(null);
        }
        return false;
      }
    })().finally(() => {
      renewing = null;
    });
    return renewing;
  }

  return {
    api,
    async restore() {
      if (!(await renew())) return null;
      return (await api.request(MeQuery)).me;
    },
    async signIn(email, password) {
      return adopt((await api.request(LoginMutation, { input: { email, password } })).login);
    },
    async register(input) {
      return adopt((await api.request(RegisterMutation, { input })).register);
    },
    async signOut() {
      const token = await store.get();
      try {
        await api.request(LogoutMutation, { refreshToken: token });
      } catch {
        // Signing out locally must work offline; the server session expires on its own.
      }
      accessToken = null;
      await store.set(null);
    },
  };
}
