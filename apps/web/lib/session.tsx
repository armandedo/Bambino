'use client';

import {
  LoginMutation,
  LogoutMutation,
  MeQuery,
  RegisterMutation,
  type VariablesOf,
  type Viewer,
} from '@bambino/api-client';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from 'react';
import { api, markSignedIn, probablySignedIn, renewSession } from './browser-api';

export const ME_KEY = ['me'] as const;

/** `me` returns null for an expired access token, so try one refresh before deciding the visitor is signed out. */
async function loadViewer(): Promise<Viewer | null> {
  const first = await api.request(MeQuery);
  if (first.me) {
    markSignedIn(true);
    return first.me;
  }
  if (!probablySignedIn() || !(await renewSession())) return null;
  return (await api.request(MeQuery)).me;
}

interface SessionApi {
  viewer: Viewer | null;
  /** True until the first check finishes; pages show a loading state rather than flashing "signed out". */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<Viewer>;
  register: (input: RegisterInput) => Promise<Viewer>;
  signOut: () => Promise<void>;
}

export type RegisterInput = VariablesOf<typeof RegisterMutation>['input'];

const SessionContext = createContext<SessionApi | null>(null);

function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({ queryKey: ME_KEY, queryFn: loadViewer, staleTime: 60_000 });

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { login } = await api.request(LoginMutation, { input: { email, password } });
      markSignedIn(true);
      // Drop every cached query except the session itself, which the providers' observer stays subscribed to.
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== ME_KEY[0] });
      queryClient.setQueryData(ME_KEY, login.user);
      return login.user;
    },
    [queryClient],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      const { register: payload } = await api.request(RegisterMutation, { input });
      markSignedIn(true);
      // Drop every cached query except the session itself, which the providers' observer stays subscribed to.
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== ME_KEY[0] });
      queryClient.setQueryData(ME_KEY, payload.user);
      return payload.user;
    },
    [queryClient],
  );

  const signOut = useCallback(async () => {
    try {
      await api.request(LogoutMutation, {});
    } finally {
      markSignedIn(false);
      // Drop every cached personal query so the next visitor on this device sees nothing of this account.
      // Drop every cached query except the session itself, which the providers' observer stays subscribed to.
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== ME_KEY[0] });
      queryClient.setQueryData(ME_KEY, null);
    }
  }, [queryClient]);

  const value = useMemo(
    () => ({ viewer: data ?? null, loading: isPending, signIn, register, signOut }),
    [data, isPending, signIn, register, signOut],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionApi {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used inside <AppProviders>');
  return session;
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
          mutations: { retry: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>{children}</SessionProvider>
    </QueryClientProvider>
  );
}
