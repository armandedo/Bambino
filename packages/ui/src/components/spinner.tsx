import { cn } from './cn';

export interface SpinnerProps {
  /** Announced to screen readers. Pass `null` when a parent already announces the busy state. */
  label?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = { sm: 'size-4 border-2', md: 'size-6 border-2', lg: 'size-10 border-[3px]' } as const;

export function Spinner({ label = 'Loading', size = 'md', className }: SpinnerProps) {
  const circle = (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block animate-spin rounded-full border-current border-r-transparent',
        SIZES[size],
        label === null && className,
      )}
    />
  );
  if (label === null) return circle;
  return (
    <span role="status" className={cn('inline-flex items-center', className)}>
      {circle}
      <span className="sr-only">{label}</span>
    </span>
  );
}

export interface SkeletonProps {
  className?: string;
}

/** Placeholder block while content loads. Decorative: pair it with a Spinner or an aria-busy region. */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={cn('block animate-pulse rounded-md bg-surface-sunken motion-reduce:animate-none', className)}
    />
  );
}
