'use client';

import type { CategorySummary } from '@bambino/api-client';
import { cn } from '@bambino/ui';
import { Heart, Search, ShoppingBag, UserRound } from 'lucide-react';
import NextLink from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, type ReactNode, Suspense, useId } from 'react';
import { useCart } from '@/components/header-actions';
import { useSession } from '@/lib/session';
import { type ShopState, readShopState, shopHref } from '@/lib/shop-url';
import { Logo } from '../logo';
import { StorefrontProvider, useStorefront } from '../storefront/storefront-context';
import { StorefrontDrawer } from '../storefront/storefront-drawer';

function itemCount(count: number): string {
  return `${count} ${count === 1 ? 'item' : 'items'}`;
}

/** One stroke weight for every icon in the frame. */
const STROKE = 1.8;

const ACTION =
  'relative inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-full px-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted';

/** The number on the bag and favourites icons. Give it `key={value}` so it pops each time the number changes. */
function Count({ value }: { value: number }) {
  if (value < 1) return null;
  return (
    <span
      aria-hidden="true"
      className="count-pop absolute top-1 left-6 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[11px] leading-none font-bold text-accent-foreground"
    >
      {value > 99 ? '99+' : value}
    </span>
  );
}

/**
 * Always-visible search. `state` is the shop's current filters when the shopper is already browsing, so a search
 * narrows what they are looking at instead of starting over. Without JavaScript it is a plain GET form.
 */
function SearchField({ state }: { state: ShopState }) {
  const router = useRouter();
  const inputId = useId();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('q');
    const term = typeof value === 'string' ? value.trim() : '';
    router.push(shopHref(state, { q: term || undefined }));
  }

  return (
    <form
      role="search"
      aria-label="Search catalogue"
      action="/shop"
      method="get"
      onSubmit={submit}
      className="search-field flex h-11 w-full items-center rounded-full border border-border-strong bg-surface pr-1 pl-4"
    >
      <label htmlFor={inputId} className="sr-only">
        Search for clothes
      </label>
      <input
        key={state.q ?? ''}
        id={inputId}
        type="search"
        name="q"
        defaultValue={state.q ?? ''}
        enterKeyHint="search"
        autoComplete="off"
        placeholder="Search for clothes"
        className="h-full min-w-0 flex-1 bg-transparent text-base text-foreground placeholder:text-foreground-muted"
      />
      {(['age', 'category', 'size', 'min', 'max', 'stock', 'sort'] as const).map((key) =>
        state[key] ? <input key={key} type="hidden" name={key} value={state[key]} /> : null,
      )}
      <button
        type="submit"
        aria-label="Search products"
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary-hover"
      >
        <Search aria-hidden="true" className="size-[18px]" strokeWidth={2.2} />
      </button>
    </form>
  );
}

/** Reads the address bar, so it sits behind a Suspense boundary (see Next's useSearchParams guide). */
function ShopAwareSearch() {
  const pathname = usePathname();
  const params = useSearchParams();
  const browsing = pathname === '/' || pathname === '/shop';
  return <SearchField state={browsing ? readShopState(Object.fromEntries(params)) : {}} />;
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

/** Compact top bar: logo, search, favourites, account and bag. The search takes its own row on phones. */
function Header() {
  const { viewer, loading } = useSession();
  const cart = useCart(viewer !== null);
  const { ready, saved, openPanel } = useStorefront();
  const openBag = useBagLink();
  const count = cart.data?.itemCount ?? 0;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="retail-container flex flex-wrap items-center gap-x-4 gap-y-1.5 py-2 md:flex-nowrap md:gap-x-8 md:py-2.5">
        <NextLink href="/" aria-label="Bambino home" className="shrink-0 rounded-md">
          <Logo />
        </NextLink>
        <div className="order-last w-full md:order-none md:mx-auto md:max-w-xl md:flex-1">
          <Suspense fallback={<SearchField state={{}} />}>
            <ShopAwareSearch />
          </Suspense>
        </div>
        <div className="-mr-2 ml-auto flex items-center md:ml-0">
          <button type="button" disabled={!ready} onClick={() => openPanel('saved')} className={ACTION}>
            <Heart aria-hidden="true" className="size-[22px]" strokeWidth={STROKE} />
            <span className="sr-only">Your favourites, {saved.length} saved</span>
            <Count key={saved.length} value={saved.length} />
          </button>
          {loading ? (
            <span className="h-11 w-11" aria-hidden="true" />
          ) : (
            <NextLink href={viewer ? '/dashboard' : '/login'} className={ACTION}>
              <UserRound aria-hidden="true" className="size-[22px]" strokeWidth={STROKE} />
              {viewer ? (
                <>
                  <span className="sr-only">Your account, </span>
                  <span className="max-w-24 truncate max-lg:sr-only">{viewer.firstName}</span>
                </>
              ) : (
                <span className="max-lg:sr-only">Sign in</span>
              )}
            </NextLink>
          )}
          <NextLink href="/cart" onClick={openBag} className={ACTION}>
            <ShoppingBag aria-hidden="true" className="size-[22px]" strokeWidth={STROKE} />
            <span className="max-lg:sr-only">Bag</span>
            <span className="sr-only">, {itemCount(count)}</span>
            <Count key={count} value={count} />
          </NextLink>
        </div>
      </div>
    </header>
  );
}

// Read directly so Next inlines them into the browser bundle (lib/launch-env.ts checks them at build time).
const PREVIEW = process.env.NEXT_PUBLIC_PREVIEW_BANNER === 'true';
const MOCK_PAYMENTS = process.env.NEXT_PUBLIC_MOCK_PAYMENTS === 'true';

/** Shown on every page of a preview build: the one switch is NEXT_PUBLIC_PREVIEW_BANNER. */
export function PreviewBanner({ preview = PREVIEW, mockPayments = MOCK_PAYMENTS }) {
  if (!preview) return null;
  return (
    <div className="bg-primary px-4 py-1.5 text-center text-xs text-primary-foreground">
      <strong className="font-semibold">Preview build.</strong>{' '}
      {mockPayments ? 'Payments use test wallets only. This is a test shop.' : 'This is a test shop.'}
    </div>
  );
}

const FOOTER_LINKS = [
  { href: '/shop', label: 'Shop all' },
  { href: '/fit', label: 'Find a size' },
  { href: '/dashboard/orders', label: 'Your orders' },
  { href: '/help', label: 'Help' },
  { href: '/delivery-returns', label: 'Delivery and returns' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
] as const;

function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-background">
      <div className="retail-container flex flex-col gap-3 py-5 md:flex-row md:items-center md:gap-6">
        <NextLink href="/" aria-label="Bambino home" className="w-fit shrink-0 rounded-md">
          <Logo className="h-6" />
        </NextLink>
        <nav aria-label="Footer" className="md:mr-auto">
          <ul className="-mx-2 flex flex-wrap">
            {FOOTER_LINKS.map((link) => (
              <li key={link.href}>
                <NextLink
                  href={link.href}
                  className="inline-flex min-h-10 items-center rounded-md px-2 text-sm underline-offset-4 hover:underline"
                >
                  {link.label}
                </NextLink>
              </li>
            ))}
          </ul>
        </nav>
        <p className="shrink-0 text-sm text-foreground-muted">
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

/** Website frame: skip link, preview notice, sticky header, main landmark, footer and the side panel. */
function ChromeContent({ children }: { children: ReactNode }) {
  const { ready } = useStorefront();
  return (
    <div
      data-storefront-ready={ready}
      className={cn('storefront flex min-h-dvh flex-col bg-background text-foreground')}
    >
      <SkipLink />
      <PreviewBanner />
      <Header />
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>
      <Footer />
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
