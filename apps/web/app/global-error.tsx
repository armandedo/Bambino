'use client';

import { RouteError, type RouteErrorValue } from '@/components/route-error';
import './globals.css';

/** Replaces the root layout when it fails, so it brings its own document and styles. */
export default function GlobalError({ error, retry }: { error: RouteErrorValue; retry: () => void }) {
  return (
    <html lang="en">
      <body>
        <title>Something went wrong · Bambino</title>
        <main className="mx-auto max-w-2xl px-4 py-16">
          <RouteError error={error} retry={retry} what="Bambino" />
        </main>
      </body>
    </html>
  );
}
