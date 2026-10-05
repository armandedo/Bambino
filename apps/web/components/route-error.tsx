'use client';

import { ApiError } from '@bambino/api-client';
import { Button, ErrorState } from '@bambino/ui';
import { useEffect } from 'react';

export type RouteErrorValue = Error & { digest?: string };

/**
 * The reference shown to the parent so support can find the failure: the API's request id when the error came
 * from an API call in the browser, otherwise Next's digest, which is printed next to the error in the server log.
 * (In production Next replaces errors from server rendering, so only the digest survives those.)
 */
export function errorReference(error: RouteErrorValue): string | undefined {
  if (error instanceof ApiError && error.requestId) return error.requestId;
  return error.digest;
}

/** Fallback for an error boundary: what failed, a reference, and a way to try again. */
export function RouteError({
  error,
  retry,
  what,
}: {
  error: RouteErrorValue;
  retry: () => void;
  /** What could not be shown, for example "your account". */
  what: string;
}) {
  useEffect(() => {
    // Until error reporting is wired (Phase 4), the browser console is where this goes.
    console.error(error);
  }, [error]);
  const unreachable = error instanceof ApiError && error.code === 'NETWORK';
  return (
    <ErrorState
      title={`We couldn't show ${what}`}
      description={
        unreachable
          ? 'We can’t reach Bambino right now. Check your connection and try again.'
          : 'Something went wrong on our side. Please try again in a moment.'
      }
      requestId={errorReference(error)}
      action={<Button onClick={() => retry()}>Try again</Button>}
    />
  );
}
