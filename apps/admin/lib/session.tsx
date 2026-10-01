'use client';

import {
  ApiError,
  LoginMutation,
  LogoutMutation,
  MeQuery,
  type Viewer,
  createBrowserSession,
} from '@bambino/api-client';
import type { Permission } from '@bambino/types';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from 'react';

/**
 * Same session plumbing as the website (shared code in @bambino/api-client). In production both apps are
 * served from one domain, so they share the session cookie and the cross-tab refresh lock.
 */
export const { api, renewSession, markSignedIn, probablySignedIn } = createBrowserSession({
  url: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/graphql',
});

const ME_KEY = ['me'] as const;

async function loadViewer(): Promise<Viewer | null> {
  const first = await api.request(MeQuery);
  if (first.me) {
    markSignedIn(true);
    return first.me;
  }
  if (!probablySignedIn() || !(await renewSession())) return null;
  return (await api.request(MeQuery)).me;
}

interface StaffSession {
  viewer: Viewer | null;
  loading: boolean;
  /** Staff are accounts holding at least one permission; customers hold none. */
  isStaff: boolean;
  /** For showing or hiding controls only. The API checks every permission again. */
  can: (permission: Permission) => boolean;
  signIn: (email: string, password: string) => Promise<Viewer>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<StaffSession | null>(null);

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

  const signOut = useCallback(async () => {
    try {
      await api.request(LogoutMutation, {});
    } finally {
      markSignedIn(false);
      // Drop every cached query except the session itself, which the providers' observer stays subscribed to.
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== ME_KEY[0] });
      queryClient.setQueryData(ME_KEY, null);
    }
  }, [queryClient]);

  const value = useMemo<StaffSession>(() => {
    const viewer = data ?? null;
    const permissions = new Set(viewer?.permissions ?? []);
    return {
      viewer,
      loading: isPending,
      isStaff: permissions.size > 0,
      can: (permission) => permissions.has(permission),
      signIn,
      signOut,
    };
  }, [data, isPending, signIn, signOut]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useStaff(): StaffSession {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useStaff must be used inside <AdminProviders>');
  return session;
}

export function AdminProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // A permission error will not fix itself on retry.
            retry: (count, error) =>
              count < 1 &&
              !(error instanceof ApiError && ['FORBIDDEN', 'UNAUTHENTICATED'].includes(error.code)),
            refetchOnWindowFocus: false,
            staleTime: 15_000,
          },
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

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
