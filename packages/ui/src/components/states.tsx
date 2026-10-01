import type { ReactNode } from 'react';
import { cn } from './cn';

interface StateProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  /** Heading level that fits the page outline. */
  level?: 2 | 3;
  className?: string;
}

function StateLayout({
  title,
  description,
  action,
  icon,
  level = 2,
  className,
  role,
}: StateProps & { role?: 'alert' }) {
  const Heading = `h${level}` as const;
  return (
    <div
      role={role}
      className={cn(
        'flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center',
        className,
      )}
    >
      {icon ? (
        <div
          aria-hidden="true"
          className="flex size-12 items-center justify-center rounded-full bg-surface-muted text-foreground-muted"
        >
          {icon}
        </div>
      ) : null}
      <Heading className="font-display text-lg font-bold text-foreground">{title}</Heading>
      {description ? <p className="max-w-md text-foreground-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

const EMPTY_ICON = (
  <svg
    viewBox="0 0 24 24"
    className="size-6"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
  >
    <path d="M4 7h16l-1.5 11.5a2 2 0 0 1-2 1.5h-9a2 2 0 0 1-2-1.5L4 7Zm4 0V5.5a4 4 0 0 1 8 0V7" />
  </svg>
);

const ERROR_ICON = (
  <svg
    viewBox="0 0 24 24"
    className="size-6"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
  >
    <path d="M12 8v5m0 3h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
  </svg>
);

/** Nothing to show yet. Says what would appear here and, when possible, how to get it. */
export function EmptyState(props: StateProps) {
  return <StateLayout icon={EMPTY_ICON} {...props} />;
}

export interface ErrorStateProps extends StateProps {
  /** Request id from the API error, so support can find the log line. */
  requestId?: string | undefined;
}

/** Something failed. Announced to screen readers, and offers a way forward (usually "Try again"). */
export function ErrorState({ requestId, description, ...props }: ErrorStateProps) {
  return (
    <StateLayout
      icon={ERROR_ICON}
      role="alert"
      description={
        <>
          {description}
          {requestId ? (
            <span className="mt-2 block text-sm">
              Reference: <code className="font-mono">{requestId}</code>
            </span>
          ) : null}
        </>
      }
      {...props}
    />
  );
}
