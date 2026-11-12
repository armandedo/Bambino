'use client';

import { cn } from '@bambino/ui';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

/**
 * Size, price and sort fields. Always open on desktop; behind one button on phones and tablets, where they stay
 * in the form (and in the URL) while folded away.
 */
export function ShopFilters({
  children,
  activeCount = 0,
  className,
  panelClassName,
}: {
  children: ReactNode;
  activeCount?: number;
  className?: string;
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={className}>
      <button
        type="button"
        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 font-medium lg:hidden"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <span className="flex items-center gap-2.5">
          <SlidersHorizontal className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
          Filter and sort{activeCount ? ` (${activeCount})` : ''}
        </span>
        <ChevronDown
          className={cn('size-[18px] transition-transform duration-200', open && 'rotate-180')}
          strokeWidth={1.8}
          aria-hidden="true"
        />
      </button>
      <div id={id} className={cn(open ? 'max-lg:mt-4' : 'max-lg:hidden', panelClassName)}>
        {children}
      </div>
    </div>
  );
}
