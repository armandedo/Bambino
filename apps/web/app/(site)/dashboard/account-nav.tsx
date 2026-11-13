'use client';

import { cn } from '@bambino/ui';
import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { RequireAuth } from '@/components/require-auth';

const LINKS = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/baby', label: 'Children and sizes' },
  { href: '/dashboard/orders', label: 'Orders' },
  { href: '/dashboard/payments', label: 'Payments' },
  { href: '/account', label: 'Settings' },
] as const;

export function AccountFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <RequireAuth>
      {() => (
        <div className="retail-container grid grid-cols-1 gap-5 py-5 lg:grid-cols-[13rem_1fr] lg:gap-10 lg:py-8">
          {/* min-w-0: lets the horizontally scrolling menu shrink to the screen instead of widening the page. */}
          <nav aria-label="Account" className="min-w-0">
            <ul className="no-scrollbar flex gap-1 overflow-x-auto lg:flex-col">
              {LINKS.map((link) => {
                const current =
                  link.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(link.href);
                return (
                  <li key={link.href} className="shrink-0">
                    <NextLink
                      href={link.href}
                      aria-current={current ? 'page' : undefined}
                      className={cn(
                        'flex min-h-11 items-center rounded-md px-3 text-sm font-medium whitespace-nowrap',
                        current ? 'bg-primary text-primary-foreground' : 'hover:bg-surface-muted',
                      )}
                    >
                      {link.label}
                    </NextLink>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="flex min-w-0 flex-col gap-5">{children}</div>
        </div>
      )}
    </RequireAuth>
  );
}

export function PageTitle({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold md:text-2xl">{title}</h1>
        {description ? <p className="text-sm text-foreground-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
