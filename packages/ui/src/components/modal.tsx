'use client';

import { type ReactNode, useEffect, useId, useRef } from 'react';
import { cn } from './cn';

export interface ModalProps {
  open: boolean;
  /** Called on Escape, the close button, or a click on the backdrop. */
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Buttons, right-aligned at the bottom. */
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Prevents closing by backdrop click, for flows such as "waiting for payment". Escape still works. */
  dismissOnBackdrop?: boolean;
}

const SIZES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' } as const;

/**
 * Built on the native `<dialog>` opened with `showModal()`: the browser traps focus, makes the rest of the
 * page inert, closes on Escape and returns focus to the opener. No focus-trap library is needed.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissOnBackdrop = true,
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        // Keep React state the source of truth: the parent decides whether to close.
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (dismissOnBackdrop && event.target === event.currentTarget) onClose();
      }}
      className={cn(
        'm-auto w-[calc(100%-2rem)] rounded-2xl border border-border bg-surface p-0 text-foreground shadow-lg',
        'backdrop:bg-sand-900/50',
        SIZES[size],
      )}
    >
      {open ? (
        <div className="flex flex-col gap-4 p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h2 id={titleId} className="font-display text-xl font-semibold">
                {title}
              </h2>
              {description ? (
                <p id={descriptionId} className="text-sm text-foreground-muted">
                  {description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-m-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-focus"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
              >
                <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          {children ? <div>{children}</div> : null}
          {footer ? <div className="flex flex-wrap justify-end gap-3 pt-2">{footer}</div> : null}
        </div>
      ) : null}
    </dialog>
  );
}
