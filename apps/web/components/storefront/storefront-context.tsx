'use client';

import type { CategorySummary, Money, ProductCard } from '@bambino/api-client';
import { MoneyText, buttonClasses } from '@bambino/ui';
import { X } from 'lucide-react';
import Image from 'next/image';
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
import { SHOP_AGES } from '@/lib/shop-ages';
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

const GROUP_TITLE = 'mb-1 text-[15px] text-foreground-muted';
const ROW = 'flex min-h-[52px] items-center rounded-lg text-lg font-medium';
const AGE_ROW = 'flex min-h-[68px] items-center gap-4 rounded-lg text-lg font-medium';
const THUMB = 'block h-[108px] w-[86px] shrink-0 overflow-hidden rounded-xl border border-border';
const EMPTY_PANEL = 'flex flex-col items-start gap-3 px-6 py-10';
const EMPTY_TITLE = 'text-2xl font-semibold tracking-[-0.03em]';

function MenuContent() {
  const { categories, openPanel } = useStorefront();
  return (
    <div
      className="flex flex-col gap-7 px-6 pt-5 pb-8"
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('a')) openPanel(null);
      }}
    >
      <nav aria-label="Shop by age">
        <p className={GROUP_TITLE}>Shop by age</p>
        <ul className="divide-y divide-border">
          {SHOP_AGES.map((age) => (
            <li key={age.slug}>
              <NextLink href={`/shop?age=${age.slug}`} className={AGE_ROW}>
                <span className="arch-door flex w-11 shrink-0 items-end justify-center overflow-hidden border border-border bg-background pb-1">
                  <Image
                    src={age.image.src}
                    alt=""
                    width={age.image.width}
                    height={age.image.height}
                    unoptimized
                    className="h-auto max-h-[74%] w-auto max-w-[74%]"
                  />
                </span>
                <span className="flex flex-col leading-snug">
                  {age.label}
                  <span className="text-[15px] font-normal text-foreground-muted">{age.ages}</span>
                </span>
              </NextLink>
            </li>
          ))}
        </ul>
      </nav>
      {categories.length > 0 ? (
        <nav aria-label="Shop by type">
          <p className={GROUP_TITLE}>Shop by type</p>
          <ul className="divide-y divide-border">
            <li>
              <NextLink href="/shop" className={ROW}>
                Everything
              </NextLink>
            </li>
            {categories.map((category) => (
              <li key={category.id}>
                <NextLink href={`/shop?category=${encodeURIComponent(category.slug)}`} className={ROW}>
                  {category.name}
                </NextLink>
              </li>
            ))}
          </ul>
        </nav>
      ) : (
        <NextLink href="/shop" className={buttonClasses({ fullWidth: true, className: 'cta' })}>
          Shop everything
        </NextLink>
      )}
      <nav aria-label="Help">
        <p className={GROUP_TITLE}>Help</p>
        <ul className="divide-y divide-border">
          <li>
            <NextLink href="/fit" className={ROW}>
              Find their size
            </NextLink>
          </li>
          <li>
            <NextLink href="/how-it-works" className={ROW}>
              Shopping and delivery
            </NextLink>
          </li>
          <li>
            <NextLink href="/about" className={ROW}>
              About Bambino
            </NextLink>
          </li>
        </ul>
      </nav>
    </div>
  );
}

function CartContent() {
  const { viewer, loading } = useSession();
  const { openPanel } = useStorefront();
  const cart = useCart(viewer !== null);
  if (loading || (viewer && cart.isPending))
    return (
      <p className="p-6 text-foreground-muted" role="status">
        Opening your bag…
      </p>
    );
  if (!viewer)
    return (
      <div className={EMPTY_PANEL}>
        <p className="text-lg">Sign in to see your bag and check out.</p>
        <NextLink
          onClick={() => openPanel(null)}
          href="/login?next=/cart"
          className={buttonClasses({ fullWidth: true, className: 'cta mt-2' })}
        >
          Sign in
        </NextLink>
      </div>
    );
  if (cart.isError)
    return (
      <div className={EMPTY_PANEL}>
        <p role="alert" className="text-lg">
          We couldn’t load your bag. Open the bag page to try again.
        </p>
        <NextLink
          onClick={() => openPanel(null)}
          href="/cart"
          className={buttonClasses({ className: 'mt-2' })}
        >
          Open your bag
        </NextLink>
      </div>
    );
  if (!cart.data?.items.length)
    return (
      <div className={EMPTY_PANEL}>
        <p className={EMPTY_TITLE}>Your bag is empty</p>
        <p className="text-foreground-muted">Clothes you add wait here until you check out.</p>
        <NextLink
          href="/shop"
          onClick={() => openPanel(null)}
          className={buttonClasses({ className: 'mt-2' })}
        >
          Shop everything
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
              tabIndex={-1}
              aria-hidden="true"
              className={THUMB}
            >
              <ProductPhoto src={item.product.images[0]?.url} alt="" sizes="100px" fit="contain" />
            </NextLink>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <NextLink
                onClick={() => openPanel(null)}
                href={`/shop/${item.product.slug}`}
                className="rounded-sm leading-snug font-semibold"
              >
                {item.product.name}
              </NextLink>
              <p className="text-[15px] text-foreground-muted">
                Size {item.variant.size.code}, {item.variant.color}
              </p>
              <p className="text-[15px] text-foreground-muted">Quantity {item.quantity}</p>
              <MoneyText value={item.lineTotal} className="mt-auto block font-semibold" />
            </div>
          </li>
        ))}
      </ul>
      <div className="sticky bottom-0 mt-auto flex flex-col gap-3 border-t border-border bg-surface px-6 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <p className="flex justify-between text-lg font-semibold">
          <span>Subtotal</span>
          <MoneyText value={cart.data.subtotal} />
        </p>
        <p className="text-[15px] text-foreground-muted">
          Delivery options and your total are shown at checkout.
        </p>
        <NextLink
          href="/checkout"
          onClick={() => openPanel(null)}
          className={buttonClasses({ fullWidth: true, size: 'lg', className: 'cta' })}
        >
          Checkout
        </NextLink>
        <NextLink
          href="/cart"
          onClick={() => openPanel(null)}
          className="self-center rounded-md py-2.5 font-medium underline underline-offset-4"
        >
          View and edit your bag
        </NextLink>
      </div>
    </>
  );
}

function SavedContent() {
  const { saved, removeSaved, openPanel } = useStorefront();
  if (!saved.length)
    return (
      <div className={EMPTY_PANEL}>
        <p className={EMPTY_TITLE}>No favourites yet</p>
        <p className="text-foreground-muted">
          Tap the heart on anything you like and it stays here, on this device.
        </p>
        <NextLink
          href="/shop"
          onClick={() => openPanel(null)}
          className={buttonClasses({ className: 'mt-2' })}
        >
          Shop everything
        </NextLink>
      </div>
    );
  return (
    <div className="px-6 pb-8">
      <ul className="divide-y divide-border">
        {saved.map((item) => (
          <li key={item.id} className="flex gap-4 py-5">
            <NextLink
              onClick={() => openPanel(null)}
              href={`/shop/${item.slug}`}
              tabIndex={-1}
              aria-hidden="true"
              className={THUMB}
            >
              <ProductPhoto src={item.image} alt="" sizes="100px" fit="contain" />
            </NextLink>
            <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
              <NextLink
                onClick={() => openPanel(null)}
                href={`/shop/${item.slug}`}
                className="rounded-sm leading-snug font-semibold"
              >
                {item.name}
              </NextLink>
              {item.price ? (
                <MoneyText value={item.price} className="block text-[15px] text-foreground-muted" />
              ) : null}
              <button
                type="button"
                onClick={() => removeSaved(item.id)}
                className="mt-auto min-h-11 rounded-md text-[15px] font-medium underline underline-offset-4"
              >
                Remove<span className="sr-only"> {item.name} from favourites</span>
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p className="pt-4 text-[15px] text-foreground-muted">Favourites are saved on this device.</p>
    </div>
  );
}

const TITLES = { menu: 'Menu', saved: 'Your favourites', cart: 'Your bag' } as const;

/** Native modal provides Escape, inert background, focus containment and return to its trigger. */
export function StorefrontDrawer() {
  const { panel, openPanel } = useStorefront();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // Keep showing the last panel while the dialog slides shut, so it never closes empty.
  const [shown, setShown] = useState<Exclude<Panel, null>>('menu');
  if (panel && panel !== shown) setShown(panel);
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
      <div className="flex min-h-full flex-col bg-surface">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface py-3 pr-4 pl-6">
          <h2 id={titleId} className="text-2xl font-semibold tracking-[-0.03em]">
            {TITLES[shown]}
          </h2>
          <button
            type="button"
            aria-label="Close panel"
            className="retail-icon-button"
            onClick={() => openPanel(null)}
          >
            <X className="size-[22px]" strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
        {shown === 'menu' ? <MenuContent /> : shown === 'saved' ? <SavedContent /> : <CartContent />}
      </div>
    </dialog>
  );
}
