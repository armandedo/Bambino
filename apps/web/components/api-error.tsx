import type { ApiError } from '@bambino/api-client';
import { ErrorState } from '@bambino/ui';

/** Error state for a failed server-side read. Says plainly when the API itself is unreachable. */
export function ApiErrorState({ error, what }: { error: ApiError; what: string }) {
  const unreachable = error.code === 'NETWORK';
  return (
    <ErrorState
      title={`We couldn't load ${what}`}
      description={
        unreachable
          ? 'We’re having trouble connecting to the shop. Please refresh or try again in a moment.'
          : 'Something went wrong on our side. Please try again in a moment.'
      }
      requestId={error.requestId}
    />
  );
}
