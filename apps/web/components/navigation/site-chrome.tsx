'use client';

import type { CategorySummary } from '@bambino/api-client';
import { buttonClasses, cn } from '@bambino/ui';
import { Heart, House, Menu, Search, ShoppingBag, UserRound, X } from 'lucide-react';
import NextLink from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { useCart } from '@/components/header-actions';
import { useSession } from '@/lib/session';
import { Logo } from '../logo';
import { StorefrontDrawer, StorefrontProvider, useStorefront } from '../storefront/storefront-context';

const DESKTOP_NAV = [
  { href: '/shop', label: 'Shop all' },
  { href: '/#ages', label: 'Shop by age' },
  { href: '/fit', label: 'Find a size' },
  { href: '/how-it-works', label: 'Shopping and delivery' },
] as const;

const ACCOUNT_PATHS = ['/dashboard', '/account', '/login', '/register'];

function isCurrent(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

function itemCount(count: number): string {
  return `${count} ${count === 1 ? 'item' : 'items'}`;
}

/** One stroke weight for every icon in the frame. */
const STROKE = 1.8;

const ICON_BUTTON =
  'relative inline-flex size-11 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-surface-muted lg:size-12';

/** A clothes hanger: the Shop tab on phones. */
function Hanger({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 8V7a2 2 0 1 0-2-2" />
      <path d="M12 8 3 15.5V18h18v-2.5L12 8Z" />
    </svg>
  );
}

/** The number on the bag and favourites icons. Give it `key={value}` so it pops each time the number changes. */
function Count({ value, className }: { value: number; className?: string }) {
  if (value < 1) return null;
  return (
    <span
      aria-hidden="true"
      className={cn(
        'count-pop absolute flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[11px] leading-none font-bold text-accent-foreground',
        className,
      )}
    >
      {value > 99 ? '99+' : value}
    </span>
  );
}

/** Opens under the header. Sends the search to the shop page. */
function SearchBar({ id, onClose }: { id: string; onClose: () => void }) {
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('q');
    const term = typeof value === 'string' ? value.trim() : '';
    router.push(term ? `/shop?q=${encodeURIComponent(term)}` : '/shop');
    onClose();
  }

  return (
    <div
      id={id}
      className="drop-in absolute inset-x-0 top-full border-y border-border bg-background shadow-lift"
    >
      <form
        role="search"
        aria-label="Search catalogue"
        action="/shop"
        method="get"
        onSubmit={submit}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
        className="retail-container flex items-center gap-2 py-3"
      >
        <label htmlFor={inputId} className="sr-only">
          Search for clothes
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          name="q"
          enterKeyHint="search"
          autoComplete="off"
          placeholder="Search for clothes"
          className="min-h-12 min-w-0 flex-1 rounded-full border border-border-strong bg-surface px-5 text-base text-foreground placeholder:text-foreground-muted"
        />
        <button
          type="submit"
          aria-label="Search products"
          className={buttonClasses({ size: 'lg', className: 'font-semibold max-sm:px-5' })}
        >
          Search
        </button>
        <button type="button" onClick={onClose} className={ICON_BUTTON}>
          <X aria-hidden="true" className="size-6" strokeWidth={STROKE} />
          <span className="sr-only">Close search</span>
        </button>
      </form>
    </div>
  );
}

/** Opens the bag panel. Before the page is interactive, and without JavaScript, it is a plain link to the bag page. */
function useBagLink() {
  const { ready, openPanel } = useStorefront();
  return (event: { preventDefault: () => void }) => {
    if (!ready) return;
    event.preventDefault();
    openPanel('cart');
  };
}

/** Top bar. Stays in reach while the page scrolls, and draws a hairline under itself once it has left the top. */
function Navbar() {
  const pathname = usePathname();
  const { viewer, loading } = useSession();
  const cart = useCart(viewer !== null);
  const { ready, saved, openPanel } = useStorefront();
  const openBag = useBagLink();
  const [scrolled, setScrolled] = useState(false);
  // The page the search was opened on: moving to another page closes it without an effect.
  const [searchOn, setSearchOn] = useState<string | null>(null);
  const searchOpen = searchOn === pathname;
  const searchId = useId();
  const searchButton = useRef<HTMLButtonElement>(null);
  const count = cart.data?.itemCount ?? 0;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function closeSearch() {
    setSearchOn(null);
    searchButton.current?.focus();
  }

  return (
    <header
      className={cn(
        'sticky top-0 z-40 border-b bg-background transition-colors duration-300',
        scrolled && !searchOpen ? 'border-border' : 'border-transparent',
      )}
    >
      <div className="retail-container flex h-[60px] items-center justify-between gap-6 lg:h-[88px]">
        <NextLink href="/" aria-label="Bambino home" className="shrink-0 rounded-md">
          <Logo />
        </NextLink>
        <nav aria-label="Main" className="max-lg:hidden">
          <ul className="flex items-center gap-7 xl:gap-9">
            {DESKTOP_NAV.map((item) => {
              const current = isCurrent(pathname, item.href);
              return (
                <li key={item.href}>
                  <NextLink
                    href={item.href}
                    aria-current={current ? 'page' : undefined}
                    className={cn(
                      'inline-flex min-h-11 items-center rounded-md font-medium underline-offset-[6px] hover:underline',
                      current && 'underline decoration-accent decoration-2',
                    )}
                  >
                    {item.label}
                  </NextLink>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="-mr-2.5 flex items-center lg:-mr-3 lg:gap-1">
          <button
            ref={searchButton}
            type="button"
            aria-expanded={searchOpen}
            aria-controls={searchOpen ? searchId : undefined}
            onClick={() => (searchOpen ? closeSearch() : setSearchOn(pathname))}
            className={ICON_BUTTON}
          >
            <Search aria-hidden="true" className="size-6" strokeWidth={STROKE} />
            <span className="sr-only">Search</span>
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={() => openPanel('saved')}
            className={cn(ICON_BUTTON, 'max-lg:hidden')}
          >
            <Heart aria-hidden="true" className="size-6" strokeWidth={STROKE} />
            <span className="sr-only">Your favourites, {saved.length} saved</span>
            <Count key={saved.length} value={saved.length} className="top-1.5 right-1" />
          </button>
          {loading ? (
            <span className="size-12 max-lg:hidden" aria-hidden="true" />
          ) : (
            <NextLink href={viewer ? '/dashboard' : '/login'} className={cn(ICON_BUTTON, 'max-lg:hidden')}>
              <UserRound aria-hidden="true" className="size-6" strokeWidth={STROKE} />
              <span className="sr-only">{viewer ? `Your account, ${viewer.firstName}` : 'Sign in'}</span>
            </NextLink>
          )}
          <NextLink href="/cart" onClick={openBag} className={cn(ICON_BUTTON, 'max-lg:hidden')}>
            <ShoppingBag aria-hidden="true" className="size-6" strokeWidth={STROKE} />
            <span className="sr-only">Bag, {itemCount(count)}</span>
            <Count key={count} value={count} className="top-1.5 right-1" />
          </NextLink>
          <button
            type="button"
            disabled={!ready}
            onClick={() => openPanel('menu')}
            className={cn(ICON_BUTTON, 'lg:hidden')}
          >
            <Menu aria-hidden="true" className="size-6" strokeWidth={STROKE} />
            <span className="sr-only">Open shopping menu</span>
          </button>
        </div>
      </div>
      {searchOpen ? <SearchBar id={searchId} onClose={closeSearch} /> : null}
    </header>
  );
}

const TAB = 'flex h-full w-full flex-col items-center justify-center gap-[3px] text-xs text-foreground';

function TabIcon({ current = false, children }: { current?: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        'relative flex h-[30px] w-[52px] items-center justify-center rounded-full transition-colors duration-200',
        current && 'bg-accent-soft',
      )}
    >
      {children}
    </span>
  );
}

/** Thumb-reachable navigation on phones and tablets: the shop, favourites, the bag and the account. */
function MobileNav() {
  const pathname = usePathname();
  const { viewer } = useSession();
  const cart = useCart(viewer !== null);
  const { ready, saved, openPanel } = useStorefront();
  const openBag = useBagLink();
  const count = cart.data?.itemCount ?? 0;
  const onHome = pathname === '/';
  const onShop = isCurrent(pathname, '/shop');
  const onAccount = ACCOUNT_PATHS.some((path) => isCurrent(pathname, path));

  return (
    <nav
      aria-label="Mobile"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="mx-auto grid h-[68px] max-w-lg grid-cols-5">
        <li>
          <NextLink
            href="/"
            aria-current={onHome ? 'page' : undefined}
            className={cn(TAB, onHome ? 'font-bold' : 'font-medium')}
          >
            <TabIcon current={onHome}>
              <House aria-hidden="true" className="size-[22px]" strokeWidth={STROKE} />
            </TabIcon>
            Home
          </NextLink>
        </li>
        <li>
          <NextLink
            href="/shop"
            aria-current={onShop ? 'page' : undefined}
            className={cn(TAB, onShop ? 'font-bold' : 'font-medium')}
          >
            <TabIcon current={onShop}>
              <Hanger className="size-[22px]" />
            </TabIcon>
            Shop
          </NextLink>
        </li>
        <li>
          <button
            type="button"
            disabled={!ready}
            onClick={() => openPanel('saved')}
            className={cn(TAB, 'font-medium')}
          >
            <TabIcon>
              <Heart aria-hidden="true" className="size-[22px]" strokeWidth={STROKE} />
              <Count key={saved.length} value={saved.length} className="-top-0.5 right-1.5" />
            </TabIcon>
            <span>
              Favourites<span className="sr-only">, {saved.length} saved</span>
            </span>
          </button>
        </li>
        <li>
          <NextLink href="/cart" onClick={openBag} className={cn(TAB, 'font-medium')}>
            <TabIcon>
              <ShoppingBag aria-hidden="true" className="size-[22px]" strokeWidth={STROKE} />
              <Count key={count} value={count} className="-top-0.5 right-1.5" />
            </TabIcon>
            <span>
              Bag<span className="sr-only">, {itemCount(count)}</span>
            </span>
          </NextLink>
        </li>
        <li>
          <NextLink
            href={viewer ? '/dashboard' : '/login'}
            aria-current={onAccount ? 'page' : undefined}
            className={cn(TAB, onAccount ? 'font-bold' : 'font-medium')}
          >
            <TabIcon current={onAccount}>
              <UserRound aria-hidden="true" className="size-[22px]" strokeWidth={STROKE} />
            </TabIcon>
            Account
          </NextLink>
        </li>
      </ul>
    </nav>
  );
}

// Read directly so Next inlines them into the browser bundle (lib/launch-env.ts checks them at build time).
const PREVIEW = process.env.NEXT_PUBLIC_PREVIEW_BANNER === 'true';
const MOCK_PAYMENTS = process.env.NEXT_PUBLIC_MOCK_PAYMENTS === 'true';

/** Shown on every page of a preview build: the one switch is NEXT_PUBLIC_PREVIEW_BANNER. */
export function PreviewBanner({ preview = PREVIEW, mockPayments = MOCK_PAYMENTS }) {
  if (!preview) return null;
  return (
    <div className="bg-primary px-4 py-2 text-center text-xs text-primary-foreground sm:text-sm">
      <strong className="font-semibold">Preview build.</strong>{' '}
      {mockPayments ? 'Payments use test wallets only. This is a test shop.' : 'This is a test shop.'}
    </div>
  );
}

const FOOTER_LINKS = [
  {
    title: 'Shop',
    links: [
      { href: '/shop', label: 'Shop everything' },
      { href: '/#ages', label: 'Shop by age' },
      { href: '/fit', label: 'Find their size' },
    ],
  },
  {
    title: 'Help',
    links: [
      { href: '/how-it-works', label: 'Shopping and delivery' },
      { href: '/about', label: 'About Bambino' },
      { href: '/cart', label: 'Your bag' },
    ],
  },
  {
    title: 'Your account',
    links: [
      { href: '/dashboard', label: 'Account home' },
      { href: '/dashboard/orders', label: 'Your orders' },
      { href: '/account', label: 'Account settings' },
    ],
  },
];

function Footer() {
  return (
    <footer className="on-navy mt-auto bg-primary pb-[var(--bottom-nav)] text-primary-foreground">
      <div className="retail-container grid gap-10 py-12 md:grid-cols-[1.5fr_repeat(3,1fr)] lg:py-16">
        <div className="flex flex-col items-start gap-5">
          <NextLink href="/" aria-label="Bambino home" className="rounded-md">
            <Logo inverse />
          </NextLink>
          <p className="max-w-[30ch] text-white/80">
            Clothes for babies, kids and teens, from newborn to seventeen. Kigali, Rwanda.
          </p>
        </div>
        {FOOTER_LINKS.map((group) => (
          <nav key={group.title} aria-label={`Footer: ${group.title}`}>
            <h2 className="font-semibold text-accent">{group.title}</h2>
            <ul className="mt-2 flex flex-col">
              {group.links.map((link) => (
                <li key={link.href}>
                  <NextLink
                    href={link.href}
                    className="inline-flex min-h-11 items-center rounded-md text-white/90 underline-offset-[5px] hover:text-white hover:underline"
                  >
                    {link.label}
                  </NextLink>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-white/15">
        <p className="retail-container py-5 text-sm text-white/75">
          © {new Date().getFullYear()} Bambino, Kigali, Rwanda
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

/** Website frame: skip link, preview notice, sticky header, main landmark, footer and the phone bottom bar. */
function ChromeContent({ children }: { children: ReactNode }) {
  const { ready } = useStorefront();
  return (
    <div
      data-storefront-ready={ready}
      className="storefront flex min-h-dvh flex-col bg-background text-foreground"
    >
      <SkipLink />
      <PreviewBanner />
      <Navbar />
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>
      {/* The footer carries the bottom padding that keeps the page clear of the phone bottom bar. */}
      <Footer />
      <MobileNav />
      <StorefrontDrawer />
    </div>
  );
}

export function SiteChrome({
  children,
  categories = [],
}: {
  children: ReactNode;
  categories?: CategorySummary[];
}) {
  return (
    <StorefrontProvider categories={categories}>
      <ChromeContent>{children}</ChromeContent>
    </StorefrontProvider>
  );
}
