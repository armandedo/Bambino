import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** `section` with a heading gives screen-reader users a landmark to jump to. */
  as?: 'div' | 'section' | 'article' | 'li';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  interactive?: boolean;
}

const PADDING = { none: '', sm: 'p-4', md: 'p-6', lg: 'p-8' } as const;

export function Card({
  as: Tag = 'div',
  padding = 'md',
  interactive = false,
  className,
  ...rest
}: CardProps) {
  return (
    <Tag
      className={cn(
        'rounded-xl border border-border bg-surface shadow-xs',
        interactive && 'transition-shadow focus-within:shadow-md hover:shadow-md',
        PADDING[padding],
        className,
      )}
      {...rest}
    />
  );
}

export interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** Heading level that fits the page outline. */
  level?: 2 | 3 | 4;
  className?: string;
}

export function CardHeader({ title, description, action, level = 2, className }: CardHeaderProps) {
  const Heading = `h${level}` as const;
  return (
    <div className={cn('mb-4 flex items-start justify-between gap-4', className)}>
      <div className="flex flex-col gap-1">
        <Heading className="font-display text-lg font-bold text-foreground">{title}</Heading>
        {description ? <p className="text-sm text-foreground-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
