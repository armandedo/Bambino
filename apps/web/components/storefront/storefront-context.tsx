'use client';

import type { CategorySummary, Money, ProductCard } from '@bambino/api-client';
import { AGE_GROUPS } from '@bambino/config';
import { MoneyText, buttonClasses } from '@bambino/ui';
import { ArrowRight, Heart, ShoppingBag, X } from 'lucide-react';
import NextLink from 'next/link';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useCart } from '@/components/header-actions';
import { useSession } from '@/lib/session';
import { ProductPhoto } from './product-photo';

type Panel = 'menu' | 'cart' | 'saved' | null;
interface SavedProduct {
  id: string;
  slug: string;
  name: string;
  image?: string | undefined;
  price: Money | null;
}
const KEY = 'bambino-saved-products-v1';
const EVENT = 'bambino-saved-products';
const EMPTY: SavedProduct[] = [];
let cachedText: string | null | undefined;
let cachedSaved = EMPTY;
let memoryOnly = false;
function readSaved(): SavedProduct[] {
  if (memoryOnly) return cachedSaved;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw !== cachedText) {
      cachedText = raw;
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      cachedSaved = Array.isArray(parsed)
        ? parsed.filter(
            (item): item is SavedProduct =>
              typeof item === 'object' &&
              item !== null &&
              typeof item.id === 'string' &&
              typeof item.slug === 'string' &&
              typeof item.name === 'string' &&
              (item.image === undefined || typeof item.image === 'string') &&
              (item.price === null ||
                (typeof item.price?.amount === 'number' && typeof item.price?.currency === 'string')),
          )
        : EMPTY;
    }
  } catch {
    /* A private window can still keep favourites for this visit. */
  }
  return cachedSaved;
}
function subscribeSaved(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}
const serverSaved = () => EMPTY;
const subscribeReady = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
interface StorefrontState {
  ready: boolean;
  panel: Panel;
  openPanel: (panel: Panel) => void;
  saved: SavedProduct[];
  toggleSaved: (product: Pick<ProductCard, 'id' | 'slug' | 'name' | 'images' | 'priceFrom'>) => void;
  removeSaved: (id: string) => void;
  categories: CategorySummary[];
}
const Context = createContext<StorefrontState | null>(null);

export function StorefrontProvider({
  children,
  categories,
}: {
  children: ReactNode;
  categories: CategorySummary[];
}) {
  const [panel, openPanel] = useState<Panel>(null);
  const saved = useSyncExternalStore(subscribeSaved, readSaved, serverSaved);
  const ready = useSyncExternalStore(subscribeReady, clientReady, serverReady);
  const write = useCallback((next: SavedProduct[]) => {
    cachedSaved = next;
    cachedText = JSON.stringify(next);
    try {
      localStorage.setItem(KEY, cachedText);
    } catch {
      memoryOnly = true;
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  const removeSaved = useCallback(
    (id: string) => write(readSaved().filter((item) => item.id !== id)),
    [write],
  );
  const toggleSaved = useCallback(
    (product: Pick<ProductCard, 'id' | 'slug' | 'name' | 'images' | 'priceFrom'>) => {
      const current = readSaved();
      write(
        current.some((item) => item.id === product.id)
          ? current.filter((item) => item.id !== product.id)
          : [
              ...current,
              {
                id: product.id,
                slug: product.slug,
                name: product.name,
                image: product.images[0]?.url,
                price: product.priceFrom,
              },
            ],
      );
    },
    [write],
  );
  return (
    <Context.Provider value={{ ready, panel, openPanel, saved, toggleSaved, removeSaved, categories }}>
      {children}
    </Context.Provider>
  );
}
export function useStorefront() {
  const state = useContext(Context);
  if (!state) throw new Error('Storefront controls need StorefrontProvider');
  return state;
}

function MenuContent() {
  const { categories, openPanel } = useStorefront();
  return (
    <div
      className="space-y-8 p-6"
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('a')) openPanel(null);
      }}
    >
      <NextLink href="/shop?sort=NEWEST" className="flex items-center justify-between text-lg font-bold">
        Shop new arrivals <ArrowRight className="size-5" aria-hidden="true" />
      </NextLink>
      <nav aria-label="Browse clothing">
        <p className="mb-3 text-sm font-semibold text-foreground-muted">Their everyday wardrobe</p>
        <ul className="divide-y divide-border">
          {categories.map((category) => (
            <li key={category.id}>
              <NextLink
                href={`/shop?category=${encodeURIComponent(category.slug)}`}
                className="block py-3 font-medium"
              >
                {category.name}
              </NextLink>
            </li>
          ))}
        </ul>
      </nav>
      <nav aria-label="Shop by age">
        <p className="mb-4 font-bold">Find their little stage</p>
        <ul className="grid grid-cols-2 gap-2">
          {AGE_GROUPS.map((age) => (
            <li key={age.slug}>
              <NextLink
                href={`/shop?age=${age.slug}`}
                className="block rounded-xl bg-surface-muted p-3 font-medium"
              >
                {age.ages}
              </NextLink>
            </li>
          ))}
        </ul>
      </nav>
      <NextLink href="/fit" className={buttonClasses({ fullWidth: true })}>
        Help me find their size
      </NextLink>
      <div className="flex flex-wrap gap-5 text-base">
        <NextLink href="/about" className="underline underline-offset-4">
          Our story
        </NextLink>
        <NextLink href="/how-it-works" className="underline underline-offset-4">
          Shopping & delivery
        </NextLink>
      </div>
    </div>
  );
}

function CartContent() {
  const { viewer, loading } = useSession();
  const { openPanel } = useStorefront();
  const cart = useCart(viewer !== null);
  if (loading || (viewer && cart.isPending))
    return (
      <p className="p-6" role="status">
        Opening your bag…
      </p>
    );
  if (!viewer)
    return (
      <div className="space-y-5 p-6">
        <p>Sign in to see your bag and keep your favourites close.</p>
        <NextLink
          onClick={() => openPanel(null)}
          href="/login?next=/cart"
          className={buttonClasses({ fullWidth: true })}
        >
          Sign in to your bag
        </NextLink>
      </div>
    );
  if (cart.isError)
    return (
      <div className="space-y-5 p-6">
        <p role="alert">Your bag could not be loaded just now.</p>
        <NextLink onClick={() => openPanel(null)} href="/cart" className={buttonClasses()}>
          Open your bag
        </NextLink>
      </div>
    );
  if (!cart.data?.items.length)
    return (
      <div className="flex flex-col items-center gap-5 px-6 py-16 text-center">
        <ShoppingBag className="size-12 text-emphasis" aria-hidden="true" strokeWidth={1.3} />
        <p className="font-display text-2xl font-bold">A little room for lovely things.</p>
        <p className="text-foreground-muted">Your bag is empty. Let’s find their next favourite.</p>
        <NextLink href="/shop" onClick={() => openPanel(null)} className={buttonClasses()}>
          Explore the shop
        </NextLink>
      </div>
    );
  return (
    <>
      <ul className="divide-y divide-border px-6">
        {cart.data.items.map((item) => (
          <li key={item.id} className="flex gap-4 py-5">
            <NextLink
              onClick={() => openPanel(null)}
              href={`/shop/${item.product.slug}`}
              className="h-28 w-22 shrink-0 overflow-hidden rounded-xl"
            >
              <ProductPhoto src={item.product.images[0]?.url} alt={item.product.name} sizes="100px" />
            </NextLink>
            <div className="flex-1">
              <NextLink
                onClick={() => openPanel(null)}
                href={`/shop/${item.product.slug}`}
                className="font-semibold"
              >
                {item.product.name}
              </NextLink>
              <p className="mt-2 text-sm text-foreground-muted">
                {item.variant.size.code} · {item.variant.color}
              </p>
              <p className="mt-2 text-sm">Quantity {item.quantity}</p>
              <MoneyText value={item.lineTotal} className="mt-2 block font-semibold" />
            </div>
          </li>
        ))}
      </ul>
      <div className="sticky bottom-0 mt-auto space-y-4 border-t border-border bg-white p-6">
        <p className="flex justify-between font-bold">
          <span>Subtotal</span>
          <MoneyText value={cart.data.subtotal} />
        </p>
        <p className="text-sm text-foreground-muted">Delivery options and totals are shown at checkout.</p>
        <NextLink
          href="/checkout"
          onClick={() => openPanel(null)}
          className={buttonClasses({ fullWidth: true, size: 'lg' })}
        >
          Checkout <ArrowRight className="size-4" aria-hidden="true" />
        </NextLink>
        <NextLink
          href="/cart"
          onClick={() => openPanel(null)}
          className="block py-2 text-center font-semibold underline underline-offset-4"
        >
          View & edit your bag
        </NextLink>
      </div>
    </>
  );
}

function SavedContent() {
  const { saved, removeSaved, openPanel } = useStorefront();
  return (
    <div className="p-6">
      <p className="mb-6 text-base text-foreground-muted">A few things you love, saved on this device.</p>
      {saved.length ? (
        <ul className="space-y-5">
          {saved.map((item) => (
            <li key={item.id} className="flex gap-4">
              <NextLink
                onClick={() => openPanel(null)}
                href={`/shop/${item.slug}`}
                className="h-28 w-22 shrink-0 overflow-hidden rounded-xl"
              >
                <ProductPhoto src={item.image} alt={item.name} sizes="100px" />
              </NextLink>
              <div className="flex-1">
                <NextLink
                  onClick={() => openPanel(null)}
                  href={`/shop/${item.slug}`}
                  className="font-semibold"
                >
                  {item.name}
                </NextLink>
                {item.price ? <MoneyText value={item.price} className="mt-2 block" /> : null}
                <button
                  type="button"
                  onClick={() => removeSaved(item.id)}
                  className="mt-2 min-h-11 text-sm underline underline-offset-4"
                >
                  Remove {item.name} from favourites
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-5 py-10 text-center">
          <Heart className="size-12 text-emphasis" aria-hidden="true" strokeWidth={1.3} />
          <p className="font-display text-2xl font-bold">Found something lovely?</p>
          <p>Tap a heart to keep it here.</p>
          <NextLink href="/shop" onClick={() => openPanel(null)} className={buttonClasses()}>
            Find a favourite
          </NextLink>
        </div>
      )}
    </div>
  );
}

/** Native modal provides Escape, inert background, focus containment and return to its trigger. */
export function StorefrontDrawer() {
  const { panel, openPanel } = useStorefront();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (panel && !dialog.open) dialog.showModal();
    if (!panel && dialog.open) dialog.close();
    if (!panel) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [panel]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-modal="true"
      className="retail-drawer"
      onCancel={() => openPanel(null)}
      onClose={() => openPanel(null)}
      onClick={(event) => {
        if (event.target === event.currentTarget) openPanel(null);
      }}
    >
      <div className="flex min-h-full flex-col bg-white">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-white px-6 py-4">
          <h2 id={titleId} className="font-display text-2xl font-bold">
            {panel === 'menu'
              ? 'Hello, little shopper.'
              : panel === 'saved'
                ? 'Your little favourites'
                : 'Your shopping bag'}
          </h2>
          <button
            type="button"
            aria-label="Close panel"
            className="retail-icon-button"
            onClick={() => openPanel(null)}
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        {panel === 'menu' ? (
          <MenuContent />
        ) : panel === 'saved' ? (
          <SavedContent />
        ) : panel === 'cart' ? (
          <CartContent />
        ) : null}
      </div>
    </dialog>
  );
}
