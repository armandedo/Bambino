'use client';

import { cn } from '@bambino/ui';
import { House, RefreshCw, Search, Shirt, ShoppingBag, UserRound } from 'lucide-react';
import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { useCart } from '@/components/header-actions';
import { useSession } from '@/lib/session';
import { Logo } from '../logo';

const DESKTOP_NAV = [
  { href: '/shop', label: 'Shop' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/plans', label: 'Subscriptions' },
  { href: '/exchange', label: 'Exchange' },
  { href: '/sustainability', label: 'Sustainability' },
] as const;

function isCurrent(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

const ICON_BUTTON =
  'relative inline-flex size-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

function BagLink({ count }: { count: number }) {
  return (
    <NextLink href="/cart" className={ICON_BUTTON}>
      <ShoppingBag aria-hidden="true" className="size-5" strokeWidth={1.75} />
      <span className="sr-only">Bag{count > 0 ? `, ${count} ${count === 1 ? 'item' : 'items'}` : ''}</span>
      {count > 0 ? (
        <span
          aria-hidden="true"
          className="absolute top-1.5 right-1.5 flex min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[0.625rem] leading-4 font-bold text-accent-foreground"
        >
          {count}
        </span>
      ) : null}
    </NextLink>
  );
}

/** Top bar. Turns from cream to a bordered, blurred surface once the page scrolls. */
function Navbar() {
  const pathname = usePathname();
  const { viewer, loading } = useSession();
  const cart = useCart(viewer !== null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 transition-[background-color,border-color,box-shadow] duration-300 ease-brand',
        scrolled
          ? 'border-b border-border bg-background/90 shadow-xs backdrop-blur'
          : 'border-b border-transparent bg-background',
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
        <NextLink
          href="/"
          aria-label="Bambino home"
          className="shrink-0 rounded-md focus-visible:outline-2 focus-visible:outline-focus"
        >
          <Logo />
        </NextLink>
        <nav aria-label="Main" className="hidden flex-1 justify-center lg:flex">
          <ul className="flex items-center gap-1">
            {DESKTOP_NAV.map((item) => {
              const current = isCurrent(pathname, item.href);
              return (
                <li key={item.href}>
                  <NextLink
                    href={item.href}
                    aria-current={current ? 'page' : undefined}
                    className={cn(
                      'relative rounded-full px-3 py-2 text-[0.95rem] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-focus',
                      current ? 'text-primary' : 'text-foreground-muted hover:text-foreground',
                    )}
                  >
                    {item.label}
                    {current ? (
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-accent"
                      />
                    ) : null}
                  </NextLink>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-1 lg:ml-0">
          <NextLink href="/shop#search" className={ICON_BUTTON}>
            <Search aria-hidden="true" className="size-5" strokeWidth={1.75} />
            <span className="sr-only">Search the shop</span>
          </NextLink>
          {loading ? (
            <span className="hidden size-11 sm:block" aria-hidden="true" />
          ) : viewer ? (
            <NextLink
              href="/dashboard"
              className={cn(ICON_BUTTON, 'hidden w-auto gap-2 px-3 sm:inline-flex')}
            >
              <UserRound aria-hidden="true" className="size-5" strokeWidth={1.75} />
              <span className="text-sm font-semibold">{viewer.firstName}</span>
              <span className="sr-only">: your dashboard</span>
            </NextLink>
          ) : (
            <NextLink
              href="/login"
              className="hidden min-h-11 items-center rounded-full px-4 text-sm font-semibold text-foreground hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-focus sm:inline-flex"
            >
              Sign in
            </NextLink>
          )}
          <BagLink count={cart.data?.itemCount ?? 0} />
        </div>
      </div>
    </header>
  );
}

/** Thumb-reachable navigation on phones. Wardrobe is a primary destination for subscribers. */
function MobileNav() {
  const pathname = usePathname();
  const { viewer } = useSession();
  const items = [
    { href: '/', label: 'Home', icon: House },
    { href: '/shop', label: 'Shop', icon: ShoppingBag },
    {
      href: viewer ? '/dashboard/wardrobe' : '/login?next=/dashboard/wardrobe',
      match: '/dashboard/wardrobe',
      label: 'Wardrobe',
      icon: Shirt,
    },
    { href: '/exchange', label: 'Exchange', icon: RefreshCw },
    {
      href: viewer ? '/dashboard' : '/login',
      match: viewer ? '/dashboard' : '/login',
      label: 'Account',
      icon: UserRound,
    },
  ];
  return (
    <nav
      aria-label="Mobile"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {items.map((item) => {
          const target = item.match ?? item.href;
          const current =
            target === '/dashboard'
              ? pathname === '/dashboard' ||
                (pathname.startsWith('/dashboard/') && !pathname.startsWith('/dashboard/wardrobe'))
              : isCurrent(pathname, target);
          const Icon = item.icon;
          return (
            <li key={item.label}>
              <NextLink
                href={item.href}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
                  current ? 'text-primary' : 'text-foreground-muted',
                )}
              >
                <Icon aria-hidden="true" className="size-5" strokeWidth={current ? 2.25 : 1.75} />
                {item.label}
              </NextLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function PreviewBanner() {
  return (
    <div className="bg-primary px-4 py-2 text-center text-xs text-primary-foreground sm:text-sm">
      <strong className="font-semibold">Preview build.</strong> Payments use test wallets only, and copy and
      prices are placeholders.
    </div>
  );
}

const FOOTER_LINKS = [
  {
    title: 'Bambino',
    links: [
      { href: '/how-it-works', label: 'How it works' },
      { href: '/plans', label: 'Subscriptions' },
      { href: '/exchange', label: 'Exchange' },
      { href: '/sustainability', label: 'Sustainability' },
    ],
  },
  {
    title: 'Shop',
    links: [
      { href: '/shop', label: 'All babywear' },
      { href: '/fit', label: 'Find the right fit' },
      { href: '/cart', label: 'Your bag' },
    ],
  },
  {
    title: 'Account',
    links: [
      { href: '/dashboard', label: 'Dashboard' },
      { href: '/dashboard/wardrobe', label: 'Wardrobe' },
      { href: '/account', label: 'Settings' },
    ],
  },
];

function Footer() {
  return (
    <footer className="mt-auto bg-primary text-primary-foreground">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="flex flex-col gap-4">
          <span className="font-display text-2xl font-extrabold tracking-tight">bambino</span>
          <p className="max-w-xs text-sm text-brand-100">
            Smart, sustainable babywear that grows with your baby. Designed in Kigali, built for East Africa.
          </p>
        </div>
        {FOOTER_LINKS.map((group) => (
          <nav
            key={group.title}
            aria-label={`Footer: ${group.title}`}
            className="flex flex-col gap-3 text-sm"
          >
            <p className="font-semibold text-accent-200">{group.title}</p>
            <ul className="flex flex-col gap-2">
              {group.links.map((link) => (
                <li key={link.href}>
                  <NextLink
                    href={link.href}
                    className="text-brand-50 underline decoration-brand-400 underline-offset-4 hover:decoration-accent"
                  >
                    {link.label}
                  </NextLink>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-brand-700">
        <p className="mx-auto max-w-7xl px-4 py-5 text-xs text-brand-200 sm:px-6">
          © {new Date().getFullYear()} Bambino · Kigali, Rwanda ·{' '}
          <NextLink href="/design" className="underline underline-offset-4">
            Design system
          </NextLink>
        </p>
      </div>
    </footer>
  );
}

function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only z-50 rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
    >
      Skip to content
    </a>
  );
}

/** Website frame: skip link, preview notice, sticky navbar, main landmark, footer and the phone bottom bar. */
export function SiteChrome({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <SkipLink />
      <PreviewBanner />
      <Navbar />
      {/* Bottom padding on phones keeps content clear of the fixed bottom bar. */}
      <main id="main" tabIndex={-1} className="flex-1 pb-20 focus:outline-none lg:pb-0">
        {children}
      </main>
      <Footer />
      <MobileNav />
    </div>
  );
}
