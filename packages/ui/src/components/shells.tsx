'use client';

import { type ComponentType, type ReactNode, useId, useState } from 'react';
import { cn } from './cn';

export interface NavItem {
  href: string;
  label: string;
  current?: boolean;
}

/** Lets each app supply its router's link (for example Next.js `Link`) without this package depending on it. */
export interface LinkProps {
  href: string;
  className?: string;
  children: ReactNode;
  'aria-current'?: 'page';
  onClick?: () => void;
}

export type LinkComponent = ComponentType<LinkProps>;

function PlainLink({ href, className, children, onClick, ...rest }: LinkProps) {
  return (
    <a href={href} className={className} onClick={onClick} {...rest}>
      {children}
    </a>
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

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    >
      {open ? <path d="m6 6 12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
    </svg>
  );
}

export interface SiteShellProps {
  brand: ReactNode;
  nav: readonly NavItem[];
  /** Right side of the header: sign in, account, cart. */
  actions?: ReactNode;
  /** A thin notice above the header, such as a preview or outage message. */
  banner?: ReactNode;
  footer?: ReactNode;
  link?: LinkComponent;
  children: ReactNode;
}

/** Customer website frame: skip link, header with responsive navigation, main landmark and footer. */
export function SiteShell({
  brand,
  nav,
  actions,
  banner,
  footer,
  link: Link = PlainLink,
  children,
}: SiteShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const linkClass = (current: boolean | undefined) =>
    cn(
      'rounded-full px-3 py-2 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-focus',
      current ? 'bg-primary-soft text-primary-soft-foreground' : 'text-foreground hover:bg-surface-muted',
    );

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <SkipLink />
      {banner}
      <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <div className="shrink-0">{brand}</div>
          <nav aria-label="Main" className="hidden flex-1 justify-center md:flex">
            <ul className="flex items-center gap-1">
              {nav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={linkClass(item.current)}
                    {...(item.current ? { 'aria-current': 'page' as const } : {})}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="ml-auto flex items-center gap-2 md:ml-0">{actions}</div>
          <button
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-full hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-focus md:hidden"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MenuIcon open={menuOpen} />
            <span className="sr-only">{menuOpen ? 'Close menu' : 'Open menu'}</span>
          </button>
        </div>
        <nav
          id={menuId}
          aria-label="Main mobile"
          hidden={!menuOpen}
          className="border-t border-border md:hidden"
        >
          <ul className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3">
            {nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(linkClass(item.current), 'flex min-h-11 items-center')}
                  onClick={() => setMenuOpen(false)}
                  {...(item.current ? { 'aria-current': 'page' as const } : {})}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>
      {footer ? <footer className="border-t border-border bg-surface">{footer}</footer> : null}
    </div>
  );
}

export interface AdminNavGroup {
  label: string;
  items: readonly NavItem[];
}

export interface AdminShellProps {
  brand: ReactNode;
  /** Already filtered by the signed-in staff member's permissions. */
  navGroups: readonly AdminNavGroup[];
  title: ReactNode;
  /** Right side of the top bar: page actions. */
  actions?: ReactNode;
  user?: ReactNode;
  link?: LinkComponent;
  children: ReactNode;
}

/** Staff dashboard frame: sidebar navigation (a disclosure on small screens), top bar and content. */
export function AdminShell({
  brand,
  navGroups,
  title,
  actions,
  user,
  link: Link = PlainLink,
  children,
}: AdminShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground lg:flex-row">
      <SkipLink />
      <aside className="border-b border-border bg-surface lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-64 lg:shrink-0 lg:flex-col lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between gap-2 px-4 py-4">
          {brand}
          <button
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-full hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-focus lg:hidden"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MenuIcon open={menuOpen} />
            <span className="sr-only">{menuOpen ? 'Close navigation' : 'Open navigation'}</span>
          </button>
        </div>
        <nav
          id={menuId}
          aria-label="Admin"
          className={cn('flex-1 overflow-y-auto px-3 pb-4 lg:block', menuOpen ? 'block' : 'hidden')}
        >
          {navGroups.map((group) => (
            <div key={group.label} className="mb-4">
              <p className="px-3 pb-1 text-xs font-semibold tracking-wide text-foreground-muted uppercase">
                {group.label}
              </p>
              <ul className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex min-h-10 items-center rounded-md px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-focus',
                        item.current
                          ? 'bg-primary-soft text-primary-soft-foreground'
                          : 'text-foreground hover:bg-surface-muted',
                      )}
                      {...(item.current ? { 'aria-current': 'page' as const } : {})}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        {user ? <div className="hidden border-t border-border p-4 lg:block">{user}</div> : null}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-6 py-4">
          <h1 className="font-display text-2xl font-bold">{title}</h1>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </header>
        <main id="main" tabIndex={-1} className="flex-1 p-6 focus:outline-none">
          {children}
        </main>
      </div>
    </div>
  );
}
