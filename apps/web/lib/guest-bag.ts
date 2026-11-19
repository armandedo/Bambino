/**
 * The bag of a visitor who has not signed in. It lives on their device and holds only which pieces (variant ids)
 * and how many: no names, prices or personal details, and it holds no stock. Names, photos, prices and
 * availability are asked from the server each time the bag is shown.
 *
 * The functions in the first half are pure, so the rules can be tested without a browser.
 */
import { BAG_POLICY } from '@bambino/config';
import { useSyncExternalStore } from 'react';

export interface GuestBagItem {
  variantId: string;
  quantity: number;
}

export interface GuestBagState {
  items: GuestBagItem[];
  /** Made when the first piece goes in. Sent with the merge on sign-in, so a repeat adds nothing twice. */
  mergeKey: string | null;
}

export const GUEST_BAG_STORAGE_KEY = 'bambino.guest-bag.v1';
/** The same limits the server enforces (BAG_POLICY), so the controls never offer what would be refused. */
export const MAX_BAG_QUANTITY = BAG_POLICY.maxQuantityPerItem;
export const MAX_BAG_LINES = BAG_POLICY.maxLines;

export const EMPTY_GUEST_BAG: GuestBagState = { items: [], mergeKey: null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reads what was stored, keeping only well-formed lines. Anything else (old formats, tampering) is dropped. */
export function parseGuestBag(raw: string | null | undefined): GuestBagState {
  if (!raw) return EMPTY_GUEST_BAG;
  try {
    const value = JSON.parse(raw) as { items?: unknown; mergeKey?: unknown };
    if (!Array.isArray(value.items)) return EMPTY_GUEST_BAG;
    const seen = new Set<string>();
    const items: GuestBagItem[] = [];
    for (const entry of value.items as { variantId?: unknown; quantity?: unknown }[]) {
      const variantId = typeof entry?.variantId === 'string' ? entry.variantId : '';
      const quantity = typeof entry?.quantity === 'number' ? Math.floor(entry.quantity) : 0;
      if (!UUID.test(variantId) || seen.has(variantId) || quantity < 1) continue;
      seen.add(variantId);
      items.push({ variantId, quantity: Math.min(quantity, MAX_BAG_QUANTITY) });
      if (items.length === MAX_BAG_LINES) break;
    }
    if (items.length === 0) return EMPTY_GUEST_BAG;
    const mergeKey = typeof value.mergeKey === 'string' && value.mergeKey.length >= 8 ? value.mergeKey : null;
    return { items, mergeKey };
  } catch {
    return EMPTY_GUEST_BAG;
  }
}

export function serializeGuestBag(state: GuestBagState): string {
  return JSON.stringify({ items: state.items, mergeKey: state.mergeKey });
}

export type BagChange =
  | { ok: true; state: GuestBagState }
  | { ok: false; state: GuestBagState; reason: 'QUANTITY_LIMIT' | 'BAG_FULL' };

/** Adds pieces to the bag: a piece already there gets more, up to the limit. */
export function addToGuestBag(
  state: GuestBagState,
  variantId: string,
  quantity: number,
  newKey: () => string,
): BagChange {
  const existing = state.items.find((item) => item.variantId === variantId);
  if (existing) {
    if (existing.quantity + quantity > MAX_BAG_QUANTITY)
      return { ok: false, state, reason: 'QUANTITY_LIMIT' };
    return {
      ok: true,
      state: {
        ...state,
        items: state.items.map((item) =>
          item === existing ? { variantId, quantity: existing.quantity + quantity } : item,
        ),
      },
    };
  }
  if (state.items.length >= MAX_BAG_LINES) return { ok: false, state, reason: 'BAG_FULL' };
  return {
    ok: true,
    state: { items: [...state.items, { variantId, quantity }], mergeKey: state.mergeKey ?? newKey() },
  };
}

/** Sets how many of a piece the bag holds. Zero or less takes it out; an emptied bag forgets its merge key. */
export function setGuestBagQuantity(
  state: GuestBagState,
  variantId: string,
  quantity: number,
): GuestBagState {
  const items =
    quantity <= 0
      ? state.items.filter((item) => item.variantId !== variantId)
      : state.items.map((item) =>
          item.variantId === variantId ? { variantId, quantity: Math.min(quantity, MAX_BAG_QUANTITY) } : item,
        );
  return items.length === 0 ? EMPTY_GUEST_BAG : { ...state, items };
}

/**
 * Brings the stored bag in line with what the server says can be held: pieces it no longer sells are dropped and
 * quantities it reduced are reduced. Returns the same object when nothing changed.
 */
export function reconcileGuestBag(
  state: GuestBagState,
  lines: readonly { variantId: string; quantity: number }[],
): GuestBagState {
  const allowed = new Map(lines.map((line) => [line.variantId, line.quantity]));
  let changed = false;
  const items: GuestBagItem[] = [];
  for (const item of state.items) {
    const quantity = allowed.get(item.variantId);
    if (quantity === undefined) {
      changed = true;
      continue;
    }
    if (quantity < item.quantity && quantity >= 1) {
      changed = true;
      items.push({ variantId: item.variantId, quantity });
    } else {
      items.push(item);
    }
  }
  if (!changed) return state;
  return items.length === 0 ? EMPTY_GUEST_BAG : { ...state, items };
}

export function guestBagCount(state: GuestBagState): number {
  return state.items.reduce((count, item) => count + item.quantity, 0);
}

// --- the store on this device ---------------------------------------------------------------------------

let current: GuestBagState = EMPTY_GUEST_BAG;
let loaded = false;
const listeners = new Set<() => void>();

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    // Storage can be blocked (private mode, site settings). The bag then lasts for this page only.
    return null;
  }
}

function load(): GuestBagState {
  if (!loaded) {
    loaded = true;
    try {
      const stored = parseGuestBag(storage()?.getItem(GUEST_BAG_STORAGE_KEY));
      // A bag saved without its key (an older or edited copy) still needs one to be merged exactly once.
      current = stored.items.length > 0 && !stored.mergeKey ? { ...stored, mergeKey: newMergeKey() } : stored;
      if (current !== stored) storage()?.setItem(GUEST_BAG_STORAGE_KEY, serializeGuestBag(current));
    } catch {
      current = EMPTY_GUEST_BAG;
    }
  }
  return current;
}

function save(next: GuestBagState): void {
  current = next;
  loaded = true;
  try {
    if (next.items.length === 0) storage()?.removeItem(GUEST_BAG_STORAGE_KEY);
    else storage()?.setItem(GUEST_BAG_STORAGE_KEY, serializeGuestBag(next));
  } catch {
    // Kept in memory for this page.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab changed the bag.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== GUEST_BAG_STORAGE_KEY && event.key !== null) return;
    loaded = false;
    load();
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function newMergeKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `bag-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const guestBag = {
  get: load,
  add(variantId: string, quantity = 1): BagChange {
    const change = addToGuestBag(load(), variantId, quantity, newMergeKey);
    if (change.ok) save(change.state);
    return change;
  },
  setQuantity(variantId: string, quantity: number): void {
    save(setGuestBagQuantity(load(), variantId, quantity));
  },
  reconcile(lines: readonly { variantId: string; quantity: number }[]): void {
    const next = reconcileGuestBag(load(), lines);
    if (next !== current) save(next);
  },
  clear(): void {
    save(EMPTY_GUEST_BAG);
  },
};

/** The guest bag on this device. Empty while the page is rendered on the server and until it has loaded. */
export function useGuestBag(): GuestBagState {
  return useSyncExternalStore(subscribe, load, () => EMPTY_GUEST_BAG);
}
