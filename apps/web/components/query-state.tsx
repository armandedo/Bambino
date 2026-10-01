'use client';

import { ApiError } from '@bambino/api-client';
import { Button, ErrorState, Skeleton } from '@bambino/ui';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { errorMessage } from '@/lib/messages';

/** Loading skeleton, error with retry, or the content: the three states every data view needs. */
export function QueryState<T>({
  query,
  what,
  children,
  skeleton = <Skeleton className="h-40" />,
}: {
  query: UseQueryResult<T>;
  what: string;
  children: (data: T) => ReactNode;
  skeleton?: ReactNode;
}) {
  if (query.isPending) return <div aria-busy="true">{skeleton}</div>;
  if (query.isError) {
    return (
      <ErrorState
        title={`We couldn't load ${what}`}
        description={errorMessage(query.error)}
        requestId={query.error instanceof ApiError ? query.error.requestId : undefined}
        action={
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }
  return <>{children(query.data)}</>;
}
