import type { ReactNode } from 'react';
import { cn } from './cn';

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

const TONES: Record<AlertTone, string> = {
  info: 'bg-info-soft border-info-border text-info-foreground',
  success: 'bg-success-soft border-success-border text-success-foreground',
  warning: 'bg-warning-soft border-warning-border text-warning-foreground',
  danger: 'bg-danger-soft border-danger-border text-danger-foreground',
};

const ICONS: Record<AlertTone, ReactNode> = {
  info: <path d="M10 9v5m0-8h.01M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />,
  success: <path d="m6.5 10.5 2.5 2.5 4.5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />,
  warning: (
    <path d="M10 7.5v3.5m0 3h.01M8.6 3.4 2.2 14.5A1.6 1.6 0 0 0 3.6 17h12.8a1.6 1.6 0 0 0 1.4-2.5L11.4 3.4a1.6 1.6 0 0 0-2.8 0Z" />
  ),
  danger: <path d="M10 6v4.5m0 3h.01M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />,
};

export interface AlertProps {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  /**
   * `true` announces the alert immediately (role="alert"); use it for errors that appear after an action.
   * Static page notices should leave it off so screen readers are not interrupted on load.
   */
  live?: boolean;
  action?: ReactNode;
  className?: string;
}

export function Alert({ tone = 'info', title, children, live = false, action, className }: AlertProps) {
  return (
    <div
      role={live ? (tone === 'danger' ? 'alert' : 'status') : undefined}
      className={cn('flex gap-3 rounded-lg border p-4', TONES[tone], className)}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="mt-0.5 size-5 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {ICONS[tone]}
      </svg>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="text-sm">{children}</div> : null}
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    </div>
  );
}
