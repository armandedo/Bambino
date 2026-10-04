'use client';

import { cn } from '@bambino/ui';
import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { RequireAuth } from '@/components/require-auth';

const LINKS = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/baby', label: 'Baby & sizes' },
  { href: '/dashboard/wardrobe', label: 'Wardrobe' },
  { href: '/dashboard/subscription', label: 'Subscription' },
  { href: '/dashboard/exchange', label: 'Returns & exchanges' },
  { href: '/dashboard/orders', label: 'Orders & delivery' },
  { href: '/dashboard/payments', label: 'Payments' },
  { href: '/account', label: 'Settings' },
] as const;

export function AccountFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <RequireAuth>
      {() => (
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 py-10 lg:grid-cols-[14rem_1fr]">
          {/* min-w-0: lets the horizontally scrolling menu shrink to the screen instead of widening the page. */}
          <nav aria-label="Account" className="min-w-0">
            <ul className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:pb-0">
              {LINKS.map((link) => {
                const current =
                  link.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(link.href);
                return (
                  <li key={link.href} className="shrink-0">
                    <NextLink
                      href={link.href}
                      aria-current={current ? 'page' : undefined}
                      className={cn(
                        'flex min-h-11 items-center rounded-lg px-3 font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-focus',
                        current ? 'bg-primary-soft text-primary-soft-foreground' : 'hover:bg-surface-muted',
                      )}
                    >
                      {link.label}
                    </NextLink>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="flex min-w-0 flex-col gap-6">{children}</div>
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
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-primary sm:text-4xl">
          {title}
        </h1>
        {description ? <p className="text-foreground-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
