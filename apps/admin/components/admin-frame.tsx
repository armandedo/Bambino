'use client';

import type { Permission } from '@bambino/types';
import { AdminShell, Button, type LinkProps, Spinner, ToastProvider } from '@bambino/ui';
import NextLink from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { useStaff } from '@/lib/session';
import { Logo } from './logo';

interface NavEntry {
  href: string;
  label: string;
  /** Shown when the staff member holds any of these. */
  anyOf: readonly Permission[];
}

const NAV: { label: string; items: NavEntry[] }[] = [
  {
    label: 'Overview',
    items: [
      { href: '/', label: 'Dashboard', anyOf: ['report:read'] },
      { href: '/analytics', label: 'Analytics', anyOf: ['report:read'] },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/orders', label: 'Orders', anyOf: ['order:read'] },
      { href: '/deliveries', label: 'Deliveries', anyOf: ['delivery:read'] },
      { href: '/returns', label: 'Returns & inspection', anyOf: ['return:read'] },
      { href: '/exchanges', label: 'Exchanges', anyOf: ['exchange:read'] },
      { href: '/garments', label: 'Garments', anyOf: ['garment:read'] },
    ],
  },
  {
    label: 'Customers',
    items: [
      { href: '/customers', label: 'Customers', anyOf: ['customer:read'] },
      { href: '/subscriptions', label: 'Subscriptions & plans', anyOf: ['subscription:read'] },
      { href: '/payments', label: 'Payments', anyOf: ['payment:read'] },
    ],
  },
  {
    label: 'Catalogue',
    items: [
      { href: '/products', label: 'Products', anyOf: ['product:read'] },
      { href: '/inventory', label: 'Inventory', anyOf: ['inventory:read'] },
      { href: '/promotions', label: 'Promotions', anyOf: ['promotion:read'] },
    ],
  },
  {
    label: 'Administration',
    items: [
      { href: '/users', label: 'Staff & roles', anyOf: ['user_role:read'] },
      { href: '/audit-log', label: 'Audit log', anyOf: ['audit_log:read'] },
      { href: '/settings', label: 'Settings', anyOf: ['settings:write'] },
    ],
  },
];

function RouterLink(props: LinkProps) {
  return <NextLink {...props} />;
}

function isCurrent(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

/** Page title for the top bar, from the navigation entry the path belongs to. */
function titleFor(pathname: string): string {
  const entries = NAV.flatMap((group) => group.items);
  const match = entries
    .filter((entry) => isCurrent(pathname, entry.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return match?.label ?? 'Admin';
}

export function AdminFrame({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  const { viewer, loading, isStaff, can, signOut } = useStaff();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !viewer) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, viewer, router, pathname]);

  if (!viewer) {
    return (
      <main id="main" className="flex min-h-dvh items-center justify-center">
        <Spinner
          label={loading ? 'Checking your session' : 'Taking you to sign in'}
          size="lg"
          className="text-primary"
        />
      </main>
    );
  }
  if (!isStaff) {
    return (
      <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="font-display text-2xl font-semibold">No staff access</h1>
        <p className="text-foreground-muted">You are signed in as {viewer.email}, which has no staff role.</p>
        <Button variant="outline" onClick={() => void signOut().then(() => router.replace('/login'))}>
          Sign out
        </Button>
      </main>
    );
  }

  const navGroups = NAV.map((group) => ({
    label: group.label,
    items: group.items
      .filter((item) => item.anyOf.some((permission) => can(permission)))
      .map((item) => ({ href: item.href, label: item.label, current: isCurrent(pathname, item.href) })),
  })).filter((group) => group.items.length > 0);

  return (
    <ToastProvider>
      <AdminShell
        brand={
          <NextLink href="/" className="rounded-md focus-visible:outline-2 focus-visible:outline-focus">
            <Logo />
          </NextLink>
        }
        title={titleFor(pathname)}
        navGroups={navGroups}
        link={RouterLink}
        actions={actions}
        user={
          <div className="flex flex-col gap-2 text-sm">
            <p className="font-semibold">
              {viewer.firstName} {viewer.lastName}
            </p>
            <p className="text-foreground-muted">{viewer.roles.filter((r) => r !== 'CUSTOMER').join(', ')}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void signOut().then(() => router.replace('/login'))}
            >
              Sign out
            </Button>
          </div>
        }
      >
        {children}
      </AdminShell>
    </ToastProvider>
  );
}
