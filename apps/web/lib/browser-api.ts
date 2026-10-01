'use client';

import { createBrowserSession } from '@bambino/api-client';

const session = createBrowserSession({
  url: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/graphql',
});

/** The client every browser-side query and mutation uses; renewal logic lives in @bambino/api-client. */
export const { api, renewSession, markSignedIn, probablySignedIn } = session;

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
