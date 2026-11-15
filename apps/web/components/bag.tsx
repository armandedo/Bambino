'use client';

import {
  AddToCartMutation,
  type Cart,
  type CartLine,
  GuestBagQuery,
  MergeGuestBagMutation,
  RemoveFromCartMutation,
  UpdateCartItemMutation,
} from '@bambino/api-client';
import { Alert, Button, useToast } from '@bambino/ui';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { CART_KEY, useCart } from '@/components/header-actions';
import { describeAdjustments } from '@/lib/bag-notices';
import { api } from '@/lib/browser-api';
import { MAX_BAG_QUANTITY, guestBag, guestBagCount, useGuestBag } from '@/lib/guest-bag';
import { errorMessage } from '@/lib/messages';
import { useSession } from '@/lib/session';

const GUEST_BAG_KEY = 'guest-bag';
/** Where a visitor goes to check out: sign in first, then straight to checkout with their bag. */
export const GUEST_CHECKOUT_HREF = '/login?next=%2Fcheckout';

// --- things the shopper must be told about their bag ----------------------------------------------------

interface NoticeState {
  /** Lines the server changed (a piece no longer sold, fewer in stock than asked for). */
  notices: string[];
  /** The guest bag could not be added to the account. It is still on the device. */
  mergeError: string | null;
  /** Raised to ask for the merge again. */
  retry: number;
}

let noticeState: NoticeState = { notices: [], mergeError: null, retry: 0 };
const noticeListeners = new Set<() => void>();
const NO_NOTICES: NoticeState = { notices: [], mergeError: null, retry: 0 };

function setNotices(change: (state: NoticeState) => NoticeState) {
  noticeState = change(noticeState);
  for (const listener of noticeListeners) listener();
}

function subscribeNotices(listener: () => void) {
  noticeListeners.add(listener);
  return () => {
    noticeListeners.delete(listener);
  };
}

function useNotices(): NoticeState {
  return useSyncExternalStore(
    subscribeNotices,
    () => noticeState,
    () => NO_NOTICES,
  );
}

function addNotices(texts: string[]) {
  if (texts.length === 0) return;
  setNotices((state) => ({
    ...state,
    notices: [...state.notices, ...texts.filter((text) => !state.notices.includes(text))],
  }));
}

/** What changed in the bag without the shopper asking, said once and kept until they dismiss it. */
export function BagNotices({ className }: { className?: string }) {
  const { notices, mergeError } = useNotices();
  if (notices.length === 0 && !mergeError) return null;
  return (
    <div className={className}>
      {mergeError ? (
        <Alert
          tone="danger"
          title="We couldn’t add the bag from this device to your account"
          live
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => setNotices((state) => ({ ...state, mergeError: null, retry: state.retry + 1 }))}
            >
              Try again
            </Button>
          }
        >
          {mergeError} The items are still saved on this device.
        </Alert>
      ) : null}
      {notices.length > 0 ? (
        <Alert
          tone="warning"
          title="Your bag was updated"
          live
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => setNotices((state) => ({ ...state, notices: [] }))}
            >
              Dismiss
            </Button>
          }
        >
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {notices.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </Alert>
      ) : null}
    </div>
  );
}

// --- one bag, whether or not the shopper has signed in --------------------------------------------------

/** A visitor's bag, priced and checked by the server from the variant ids and quantities on this device. */
function useGuestPreview() {
  const { viewer, loading } = useSession();
  const guest = useGuestBag();
  return useQuery({
    queryKey: [GUEST_BAG_KEY, guest.items],
    queryFn: async () => (await api.request(GuestBagQuery, { items: guest.items })).guestBag,
    enabled: !loading && !viewer && guest.items.length > 0,
    // While a change is being priced, keep showing the bag as it was.
    placeholderData: keepPreviousData,
  });
}

/**
 * The shopping bag for whoever is looking: a signed-in customer's cart from the server, or a visitor's bag kept
 * on this device and priced by the server. The drawer, the bag page and the header count all read this.
 */
export function useBag() {
  const { viewer, loading } = useSession();
  const guest = useGuestBag();
  const { mergeError } = useNotices();
  const server = useCart(viewer !== null);
  const preview = useGuestPreview();
  const queryClient = useQueryClient();

  const isGuest = !viewer;
  // Signed in with a bag still on the device: it is on its way into the account.
  const merging = !isGuest && guest.items.length > 0 && !mergeError;
  const cart: Cart | null = isGuest
    ? guest.items.length > 0
      ? (preview.data?.bag ?? null)
      : null
    : (server.data ?? null);

  return {
    isGuest,
    merging,
    cart,
    /** Shown in the header straight away, before the server has priced anything. */
    count: isGuest ? guestBagCount(guest) : (server.data?.itemCount ?? 0),
    isPending:
      loading || merging || (isGuest ? guest.items.length > 0 && preview.isPending : server.isPending),
    isError: isGuest ? preview.isError : server.isError,
    error: isGuest ? preview.error : server.error,

    /** Puts one piece in the bag. */
    async add(variantId: string): Promise<void> {
      if (isGuest) {
        const change = guestBag.add(variantId, 1);
        if (!change.ok) {
          throw new Error(
            change.reason === 'BAG_FULL'
              ? 'Your bag is full. Remove something to add this.'
              : `You can have at most ${MAX_BAG_QUANTITY} of one item in your bag.`,
          );
        }
        return;
      }
      const { addToCart } = await api.request(AddToCartMutation, { variantId, quantity: 1 });
      queryClient.setQueryData(CART_KEY, addToCart);
    },

    /** Sets how many of a line the bag holds; zero takes it out. */
    async setQuantity(line: CartLine, quantity: number): Promise<void> {
      if (isGuest) {
        guestBag.setQuantity(line.variant.id, quantity);
        return;
      }
      const next =
        quantity <= 0
          ? (await api.request(RemoveFromCartMutation, { itemId: line.id })).removeFromCart
          : (await api.request(UpdateCartItemMutation, { itemId: line.id, quantity })).updateCartItem;
      queryClient.setQueryData(CART_KEY, next);
    },
  };
}

/**
 * Keeps the bag on this device honest and hands it over on sign-in. Mounted once for the whole site.
 * - While browsing as a guest: applies what the server says about the bag (a piece no longer sold is dropped, a
 *   quantity above the stock is reduced) and says so.
 * - On sign-in: sends the bag to the account once. The device copy is cleared only after the server confirms, so a
 *   failed attempt loses nothing and can be tried again with the same key, which the server will not apply twice.
 */
export function BagSync() {
  const { viewer } = useSession();
  const guest = useGuestBag();
  const { retry } = useNotices();
  const preview = useGuestPreview();
  const queryClient = useQueryClient();
  const toast = useToast();
  const attempted = useRef<string | null>(null);

  const answer = preview.isPlaceholderData ? undefined : preview.data;
  useEffect(() => {
    if (!answer) return;
    addNotices(describeAdjustments(answer.adjustments, 'guest'));
    guestBag.reconcile(
      answer.bag.items.map((line) => ({ variantId: line.variant.id, quantity: line.quantity })),
    );
  }, [answer]);

  const merge = useMutation({
    mutationFn: async (input: { mergeKey: string; items: { variantId: string; quantity: number }[] }) =>
      (await api.request(MergeGuestBagMutation, { input })).mergeGuestBag,
    onSuccess: (result) => {
      queryClient.setQueryData(CART_KEY, result.cart);
      guestBag.clear();
      setNotices((state) => ({ ...state, mergeError: null }));
      addNotices(describeAdjustments(result.adjustments, 'merge'));
      if (!result.alreadyMerged) {
        toast.show({
          title:
            result.adjustments.length > 0
              ? 'Your bag was added to your account, with changes'
              : 'Your bag was added to your account',
          tone: 'success',
        });
      }
    },
    onError: (error) => setNotices((state) => ({ ...state, mergeError: errorMessage(error) })),
  });
  const { mutate } = merge;

  const viewerId = viewer?.id ?? null;
  useEffect(() => {
    if (!viewerId || guest.items.length === 0 || !guest.mergeKey) return;
    const attempt = `${viewerId}:${guest.mergeKey}:${retry}`;
    if (attempted.current === attempt) return;
    attempted.current = attempt;
    mutate({ mergeKey: guest.mergeKey, items: guest.items });
  }, [viewerId, guest, retry, mutate]);

  return null;
}
