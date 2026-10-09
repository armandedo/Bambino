'use client';

import { ApiError } from '@bambino/api-client';
import type { Permission } from '@bambino/types';
import { Alert, Button, ErrorState, SelectField, Skeleton, humanizeStatus, useToast } from '@bambino/ui';
import { type QueryKey, type UseQueryResult, useMutation, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { errorMessage } from '@/lib/format';
import { useStaff } from '@/lib/session';

/** Hides a page from staff without the permission. The API refuses the data anyway; this explains why. */
export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { can } = useStaff();
  if (!can(permission)) {
    return (
      <Alert tone="warning" title="Not available for your role">
        This page needs the <code className="font-mono">{permission}</code> permission. Ask an administrator
        if you need it.
      </Alert>
    );
  }
  return <>{children}</>;
}

export function QueryState<T>({
  query,
  what,
  children,
  skeleton = <Skeleton className="h-48" />,
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
        title={`Could not load ${what}`}
        description={errorMessage(query.error)}
        requestId={query.error instanceof ApiError ? query.error.requestId : undefined}
        action={
          <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }
  return <>{children(query.data)}</>;
}

/** Cursor pagination with a back stack, for the API's opaque `after` cursors. */
export function usePager() {
  const [stack, setStack] = useState<(string | null)[]>([null]);
  const after = stack.at(-1) ?? null;
  return {
    after,
    page: stack.length,
    next: (cursor: string | null) => cursor && setStack((s) => [...s, cursor]),
    previous: () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)),
    reset: () => setStack([null]),
  };
}

export function Pager({
  pager,
  pageInfo,
  totalCount,
}: {
  pager: ReturnType<typeof usePager>;
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  totalCount?: number;
}) {
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <span className="text-foreground-muted">
        Page {pager.page}
        {totalCount !== undefined ? ` · ${totalCount} in total` : ''}
      </span>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={pager.page === 1} onClick={pager.previous}>
          Previous
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!pageInfo.hasNextPage}
          onClick={() => pager.next(pageInfo.endCursor)}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}

export function StatusFilter<T extends string>({
  label = 'Status',
  values,
  value,
  onChange,
}: {
  label?: string;
  values: readonly T[];
  value: T | '';
  onChange: (value: T | '') => void;
}) {
  return (
    <SelectField
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value as T | '')}
      placeholder="All"
      options={values.map((v) => ({ value: v, label: humanizeStatus(v) }))}
      className="w-56"
    />
  );
}

/**
 * A staff action: runs the mutation, refreshes the listed queries, and reports the outcome in a toast
 * (errors stay until dismissed and carry the request id).
 */
export function useAction<TVariables, TResult>(
  run: (variables: TVariables) => Promise<TResult>,
  options: { success: string | ((result: TResult) => string); invalidate?: QueryKey[] },
) {
  const toast = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: async (result) => {
      await Promise.all(
        (options.invalidate ?? []).map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
      toast.show({
        title: typeof options.success === 'function' ? options.success(result) : options.success,
        tone: 'success',
      });
    },
    onError: (error) => {
      const reference = error instanceof ApiError && error.requestId ? ` Reference: ${error.requestId}` : '';
      toast.show({
        title: 'Action failed',
        description: `${errorMessage(error)}${reference}`,
        tone: 'danger',
      });
    },
  });
}

export function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-4 shadow-xs">
      <p className="text-sm text-foreground-muted">{label}</p>
      <p className="font-display text-2xl font-extrabold tabular-nums">{value}</p>
      {hint ? <p className="text-xs text-foreground-muted">{hint}</p> : null}
    </div>
  );
}
