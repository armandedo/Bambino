import { type GraphQLClient, type Viewer } from '@bambino/api-client';
import { useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { API_URL } from '@/config';
import { type RegisterInput, createMobileSession } from './session-core';

const REFRESH_KEY = 'bambino_refresh_token';

const keystore = {
  get: () => SecureStore.getItemAsync(REFRESH_KEY),
  set: async (token: string | null) => {
    if (token === null) await SecureStore.deleteItemAsync(REFRESH_KEY);
    else await SecureStore.setItemAsync(REFRESH_KEY, token);
  },
};

export const session = createMobileSession({ url: API_URL, store: keystore });
export const api: GraphQLClient = session.api;

type Status = 'loading' | 'signedOut' | 'signedIn';

interface SessionValue {
  status: Status;
  user: Viewer | null;
  setUser: (user: Viewer) => void;
  signIn: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  signOut: () => Promise<void>;
}

const Context = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUserState] = useState<Viewer | null>(null);

  const adopt = useCallback((viewer: Viewer | null) => {
    setUserState(viewer);
    setStatus(viewer ? 'signedIn' : 'signedOut');
  }, []);

  useEffect(() => {
    let cancelled = false;
    session
      .restore()
      .then((viewer) => !cancelled && adopt(viewer))
      .catch(() => !cancelled && adopt(null));
    return () => {
      cancelled = true;
    };
  }, [adopt]);

  const value = useMemo<SessionValue>(
    () => ({
      status,
      user,
      setUser: (viewer) => setUserState(viewer),
      signIn: async (email, password) => {
        queryClient.clear();
        adopt(await session.signIn(email, password));
      },
      register: async (input) => {
        queryClient.clear();
        adopt(await session.register(input));
      },
      signOut: async () => {
        await session.signOut();
        queryClient.clear();
        adopt(null);
      },
    }),
    [status, user, adopt, queryClient],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(Context);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
