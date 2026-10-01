'use client';

import { SiteShell, ToastProvider } from '@bambino/ui';
import NextLink from 'next/link';
import { RouterLink } from '@/components/router-link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppProviders } from '@/lib/session';
import { HeaderActions } from './header-actions';
import { Logo } from './logo';

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/shop', label: 'Shop' },
  { href: '/subscriptions', label: 'Plans' },
  { href: '/design', label: 'Design system' },
] as const;

function isCurrent(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

function PreviewBanner() {
  return (
    <div className="bg-sand-800 px-4 py-2 text-center text-sm text-sand-50">
      <strong className="font-semibold">Preview build.</strong> Payments use test wallets only, and all copy
      and prices are placeholders.
    </div>
  );
}

function Footer() {
  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:grid-cols-3">
      <div className="flex flex-col gap-3">
        <Logo />
        <p className="text-foreground-muted">
          Babywear that grows with your baby. Made for families in Rwanda.
        </p>
      </div>
      <nav aria-label="Footer">
        <ul className="flex flex-col gap-2">
          <li>
            <NextLink className="text-link underline underline-offset-4 hover:decoration-2" href="/shop">
              Shop
            </NextLink>
          </li>
          <li>
            <NextLink
              className="text-link underline underline-offset-4 hover:decoration-2"
              href="/subscriptions"
            >
              Subscription plans
            </NextLink>
          </li>
          <li>
            <NextLink className="text-link underline underline-offset-4 hover:decoration-2" href="/design">
              Design system
            </NextLink>
          </li>
        </ul>
      </nav>
      <p className="text-foreground-muted sm:text-right">© {new Date().getFullYear()} Bambino</p>
    </div>
  );
}

export function SiteFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <AppProviders>
      <ToastProvider>
        <SiteShell
          brand={
            <NextLink
              href="/"
              aria-label="Bambino home"
              className="rounded-md focus-visible:outline-2 focus-visible:outline-focus"
            >
              <Logo />
            </NextLink>
          }
          nav={NAV.map((item) => ({ ...item, current: isCurrent(pathname, item.href) }))}
          actions={<HeaderActions />}
          banner={<PreviewBanner />}
          footer={<Footer />}
          link={RouterLink}
        >
          {children}
        </SiteShell>
      </ToastProvider>
    </AppProviders>
  );
}
