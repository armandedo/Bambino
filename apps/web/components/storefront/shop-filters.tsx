'use client';

import { SlidersHorizontal, ChevronDown } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

export function ShopFilters({ children, activeCount = 0 }: { children: ReactNode; activeCount?: number }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div>
      <button
        type="button"
        className="mb-4 flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-border bg-white px-4 font-semibold lg:hidden"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <span className="flex items-center gap-2">
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          Filter & sort{activeCount ? ` (${activeCount})` : ''}
        </span>
        <ChevronDown
          className={`size-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      <div id={id} className={open ? 'block' : 'hidden lg:block'}>
        {children}
      </div>
    </div>
  );
}
