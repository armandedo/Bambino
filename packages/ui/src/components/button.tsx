import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';
import { Spinner } from './spinner';

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary-hover',
  accent: 'bg-accent text-accent-foreground hover:bg-accent-hover',
  secondary: 'bg-primary-soft text-primary-soft-foreground hover:bg-brand-100',
  outline: 'border border-border-strong bg-surface text-foreground hover:bg-surface-muted',
  ghost: 'text-foreground hover:bg-surface-muted',
  danger: 'bg-danger text-primary-foreground hover:bg-danger-hover',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 text-sm gap-1.5',
  md: 'min-h-11 px-4 text-base gap-2',
  lg: 'min-h-12 px-6 text-base gap-2',
};

/**
 * Class names for anything that should look like a button, such as a Next.js `<Link>`.
 * Keeps a single definition of the look without wrapping other components.
 */
export function buttonClasses({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; fullWidth?: boolean; className?: string } = {}): string {
  return cn(
    'inline-flex items-center justify-center rounded-full font-medium tracking-tight transition-colors',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
    'disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-not-allowed aria-disabled:opacity-60',
    VARIANTS[variant],
    SIZES[size],
    fullWidth && 'w-full',
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Disables the button, shows a spinner and sets aria-busy. The label stays visible. */
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  icon,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, fullWidth, ...(className ? { className } : {}) })}
      {...rest}
    >
      {loading ? <Spinner size="sm" label={null} /> : icon}
      {children}
    </button>
  );
}
