'use client';

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { cn } from './cn';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Milliseconds before it hides itself. Errors stay until dismissed, so they are never missed. */
  durationMs?: number | null;
}

interface ToastItem extends Required<Pick<ToastInput, 'title' | 'tone'>> {
  id: number;
  description: string | undefined;
  durationMs: number | null;
}

interface ToastApi {
  show: (toast: ToastInput) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONES: Record<ToastTone, string> = {
  info: 'border-info-border',
  success: 'border-success-border',
  warning: 'border-warning-border',
  danger: 'border-danger-border',
};

const BARS: Record<ToastTone, string> = {
  info: 'bg-info-foreground',
  success: 'bg-success-foreground',
  warning: 'bg-warning-foreground',
  danger: 'bg-danger',
};

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>');
  return api;
}

function ToastView({ toast, dismiss }: { toast: ToastItem; dismiss: (id: number) => void }) {
  const { id, durationMs } = toast;
  useEffect(() => {
    if (durationMs === null) return;
    const timer = setTimeout(() => dismiss(id), durationMs);
    return () => clearTimeout(timer);
  }, [id, durationMs, dismiss]);

  return (
    <li
      className={cn(
        'pointer-events-auto flex w-full gap-3 overflow-hidden rounded-xl border bg-surface p-4 shadow-lg',
        TONES[toast.tone],
      )}
    >
      <span aria-hidden="true" className={cn('w-1 shrink-0 rounded-full', BARS[toast.tone])} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="font-semibold text-foreground">{toast.title}</p>
        {toast.description ? <p className="text-sm text-foreground-muted">{toast.description}</p> : null}
      </div>
      <button
        type="button"
        onClick={() => dismiss(id)}
        aria-label={`Dismiss: ${toast.title}`}
        className="-m-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-focus"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" />
        </svg>
      </button>
    </li>
  );
}

/**
 * Renders toasts into two always-present live regions (polite for most, assertive for errors), so
 * screen readers announce them without moving focus.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback((input: ToastInput) => {
    const id = nextId.current++;
    const tone = input.tone ?? 'info';
    const durationMs = input.durationMs !== undefined ? input.durationMs : tone === 'danger' ? null : 5000;
    setToasts((current) => [
      ...current,
      { id, title: input.title, description: input.description, tone, durationMs },
    ]);
    return id;
  }, []);

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);
  const region = (assertive: boolean) => (
    <ol
      aria-live={assertive ? 'assertive' : 'polite'}
      aria-label={assertive ? 'Urgent notifications' : 'Notifications'}
      className="flex flex-col gap-2"
    >
      {toasts
        .filter((toast) => (toast.tone === 'danger') === assertive)
        .map((toast) => (
          <ToastView key={toast.id} toast={toast} dismiss={dismiss} />
        ))}
    </ol>
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col gap-2 sm:left-auto sm:w-96">
        {region(true)}
        {region(false)}
      </div>
    </ToastContext.Provider>
  );
}
