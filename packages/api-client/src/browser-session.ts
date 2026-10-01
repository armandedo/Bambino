import { type GraphQLClient, createClient } from './client';
import { RefreshSessionMutation } from './operations/account';

/**
 * Cookie-session plumbing shared by the website and the admin dashboard.
 *
 * Tokens are httpOnly cookies set by the API; this code never sees them. It keeps a non-secret hint that the
 * browser probably has a session, so anonymous visitors are not sent through a refresh attempt, and it renews
 * the session one request at a time per browser: the API treats a reused refresh token as theft and revokes
 * the session, so two tabs must never refresh at once (Web Locks serialise across tabs; an in-flight promise
 * collapses calls within a tab).
 */
export interface BrowserSession {
  /** Client for every query and mutation; renews an expired access token once and retries. */
  api: GraphQLClient;
  renewSession: () => Promise<boolean>;
  markSignedIn: (signedIn: boolean) => void;
  probablySignedIn: () => boolean;
}

export interface BrowserSessionOptions {
  url: string;
  /** Distinguishes apps that share an origin; also names the cross-tab lock. */
  name?: string;
  fetch?: typeof fetch;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  locks?: { request: (name: string, callback: () => Promise<boolean>) => Promise<boolean> } | null;
}

function defaultStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function defaultLocks() {
  return typeof navigator !== 'undefined' && 'locks' in navigator ? navigator.locks : null;
}

export function createBrowserSession(options: BrowserSessionOptions): BrowserSession {
  const name = options.name ?? 'bambino';
  const hintKey = `${name}_session`;
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const locks = options.locks === undefined ? defaultLocks() : options.locks;
  const transport = options.fetch ? { fetch: options.fetch } : {};

  const markSignedIn = (signedIn: boolean) => {
    try {
      if (signedIn) storage?.setItem(hintKey, '1');
      else storage?.removeItem(hintKey);
    } catch {
      // Storage can be unavailable (private mode); the session still works, it just refreshes less eagerly.
    }
  };
  const probablySignedIn = () => {
    try {
      return storage ? storage.getItem(hintKey) === '1' : true;
    } catch {
      return true;
    }
  };

  const bare = createClient({ url: options.url, client: 'web', ...transport });
  let inflight: Promise<boolean> | null = null;

  const renewSession = (): Promise<boolean> => {
    if (!probablySignedIn()) return Promise.resolve(false);
    inflight ??= (async () => {
      const run = async () => {
        try {
          await bare.request(RefreshSessionMutation, {});
          markSignedIn(true);
          return true;
        } catch {
          markSignedIn(false);
          return false;
        }
      };
      return locks ? locks.request(`${name}-session-refresh`, run) : run();
    })().finally(() => {
      inflight = null;
    });
    return inflight;
  };

  const api = createClient({
    url: options.url,
    client: 'web',
    onUnauthenticated: renewSession,
    ...transport,
  });
  return { api, renewSession, markSignedIn, probablySignedIn };
}
