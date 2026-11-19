'use client';

import type { CategorySummary, Money, ProductCard } from '@bambino/api-client';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

/** The side panel: the bag, favourites, or the sizes and colours of one product. */
export type Panel = 'cart' | 'saved' | 'options' | null;

export interface SavedProduct {
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

type Saveable = Pick<ProductCard, 'id' | 'slug' | 'name' | 'images' | 'priceFrom'>;

interface StorefrontState {
  /** False on the server and until the page is interactive. */
  ready: boolean;
  panel: Panel;
  openPanel: (panel: Panel) => void;
  /** The product whose sizes and colours the options panel shows. */
  options: ProductCard | null;
  openOptions: (product: ProductCard) => void;
  saved: SavedProduct[];
  toggleSaved: (product: Saveable) => void;
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
  const [options, setOptions] = useState<ProductCard | null>(null);
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
    (product: Saveable) => {
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
  const openOptions = useCallback((product: ProductCard) => {
    setOptions(product);
    openPanel('options');
  }, []);
  const value = useMemo(
    () => ({ ready, panel, openPanel, options, openOptions, saved, toggleSaved, removeSaved, categories }),
    [ready, panel, options, openOptions, saved, toggleSaved, removeSaved, categories],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useStorefront() {
  const state = useContext(Context);
  if (!state) throw new Error('Storefront controls need StorefrontProvider');
  return state;
}
