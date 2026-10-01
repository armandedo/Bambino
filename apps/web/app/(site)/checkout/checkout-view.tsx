'use client';

import {
  CheckoutPreviewQuery,
  CreateOrderMutation,
  type OrderDetail,
  type Viewer,
} from '@bambino/api-client';
import { Alert, Button, Card, Checkbox, MoneyText, Skeleton, TextField, buttonClasses } from '@bambino/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useCallback, useState } from 'react';
import { AddressPicker, DeliveryPicker, TotalsTable } from '@/components/checkout-parts';
import { CART_KEY, useCart } from '@/components/header-actions';
import { PaymentPanel } from '@/components/payment-panel';
import { RequireAuth } from '@/components/require-auth';
import { api, newIdempotencyKey } from '@/lib/browser-api';
import { errorMessage } from '@/lib/messages';

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <Card as="section" aria-labelledby={`step-${number}`} className="flex flex-col gap-4">
      <h2 id={`step-${number}`} className="flex items-center gap-3 font-display text-xl font-bold">
        <span
          aria-hidden="true"
          className="flex size-8 items-center justify-center rounded-full bg-primary-soft text-base text-primary-soft-foreground"
        >
          {number}
        </span>
        {title}
      </h2>
      {children}
    </Card>
  );
}

function requireChoices<T>(checkout: T | null): T {
  if (!checkout) throw new Error('Choose an address and a delivery option first.');
  return checkout;
}

function Checkout({ viewer }: { viewer: Viewer }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const cart = useCart(true);
  const defaultAddress = viewer.addresses.find((a) => a.isDefault) ?? viewer.addresses[0];
  const [addressId, setAddressId] = useState<string | null>(defaultAddress?.id ?? null);
  const [deliveryCode, setDeliveryCode] = useState<string | null>(null);
  const [promoInput, setPromoInput] = useState('');
  const [promotionCode, setPromotionCode] = useState<string | null>(null);
  const [useCredit, setUseCredit] = useState(false);
  // Kept for the life of this checkout, so pressing "Place order" twice returns the same order.
  const [orderKey] = useState(newIdempotencyKey);
  const [order, setOrder] = useState<OrderDetail | null>(null);

  const checkout =
    addressId && deliveryCode
      ? {
          shippingAddressId: addressId,
          deliveryOptionCode: deliveryCode,
          promotionCode,
          applyExchangeCredit: useCredit,
        }
      : null;

  const preview = useQuery({
    queryKey: ['checkout-preview', checkout],
    queryFn: async () =>
      (await api.request(CheckoutPreviewQuery, { input: requireChoices(checkout) })).checkoutPreview,
    enabled: checkout !== null && order === null,
  });

  const place = useMutation({
    mutationFn: async () =>
      (
        await api.request(CreateOrderMutation, {
          input: { idempotencyKey: orderKey, checkout: requireChoices(checkout) },
        })
      ).createOrder,
    onSuccess: (created) => {
      setOrder(created);
      void queryClient.invalidateQueries({ queryKey: CART_KEY });
    },
  });

  const onPaid = useCallback(() => {
    if (order) router.push(`/account/orders/${order.id}?placed=1`);
  }, [order, router]);

  if (cart.isPending) return <Skeleton className="h-64" />;
  if (!order && (!cart.data || cart.data.items.length === 0)) {
    return (
      <Alert
        tone="info"
        title="Your cart is empty"
        action={
          <NextLink href="/shop" className={buttonClasses({ size: 'sm' })}>
            Go to the shop
          </NextLink>
        }
      >
        Add something before checking out.
      </Alert>
    );
  }

  if (order) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <Card className="flex flex-col gap-4">
          <h2 className="font-display text-2xl font-bold">Pay for order {order.orderNumber}</h2>
          <p className="text-foreground-muted">
            Your items are reserved while you pay. Total:{' '}
            <MoneyText value={order.totals.total} className="font-semibold text-foreground" />
          </p>
          {order.status === 'PAID' ? (
            <>
              <Alert tone="success" title="Nothing to pay">
                Your exchange credit covered the whole order.
              </Alert>
              <Button onClick={onPaid}>View order</Button>
            </>
          ) : (
            <PaymentPanel orderId={order.id} total={order.totals.total} onPaid={onPaid} />
          )}
        </Card>
      </div>
    );
  }

  const unavailable = cart.data?.items.some((item) => !item.variant.inStock) ?? false;

  return (
    <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
      <div className="flex flex-col gap-6">
        <Step number={1} title="Where should we deliver?">
          <AddressPicker viewer={viewer} value={addressId} onChange={setAddressId} />
        </Step>
        <Step number={2} title="How fast?">
          <DeliveryPicker value={deliveryCode} onChange={setDeliveryCode} />
        </Step>
        <Step number={3} title="Discounts">
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              setPromotionCode(promoInput.trim() === '' ? null : promoInput.trim().toUpperCase());
            }}
          >
            <TextField
              label="Promotion code"
              value={promoInput}
              onChange={(event) => setPromoInput(event.target.value)}
              className="min-w-48 flex-1"
              error={preview.data?.promotionError ?? undefined}
              autoCapitalize="characters"
            />
            <Button type="submit" variant="outline">
              Apply
            </Button>
          </form>
          {preview.data && preview.data.availableCredit.amount > 0 ? (
            <Checkbox
              label={
                <>
                  Use my exchange credit (<MoneyText value={preview.data.availableCredit} /> available)
                </>
              }
              checked={useCredit}
              onChange={(event) => setUseCredit(event.target.checked)}
            />
          ) : null}
        </Step>
      </div>

      <aside aria-labelledby="summary">
        <Card className="flex flex-col gap-4 lg:sticky lg:top-24">
          <h2 id="summary" className="font-display text-xl font-bold">
            Order summary
          </h2>
          <ul className="flex flex-col gap-2 text-sm">
            {cart.data?.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-3">
                <span>
                  {item.quantity} × {item.product.name}{' '}
                  <span className="text-foreground-muted">({item.variant.size.code})</span>
                </span>
                <MoneyText value={item.lineTotal} />
              </li>
            ))}
          </ul>
          {checkout === null ? (
            <p className="text-sm text-foreground-muted">
              Choose an address and a delivery option to see your total.
            </p>
          ) : preview.isPending ? (
            <Skeleton className="h-32" />
          ) : preview.isError ? (
            <Alert tone="danger" live>
              {errorMessage(preview.error)}
            </Alert>
          ) : (
            <TotalsTable totals={preview.data.totals} />
          )}
          {place.isError ? (
            <Alert tone="danger" live>
              {errorMessage(place.error)}
            </Alert>
          ) : null}
          {unavailable ? (
            <Alert tone="warning">
              Something in your cart is out of stock. Remove it from the cart to continue.
            </Alert>
          ) : null}
          <Button
            size="lg"
            fullWidth
            disabled={!preview.data || unavailable}
            loading={place.isPending}
            onClick={() => place.mutate()}
          >
            Place order and pay
          </Button>
          <p className="text-xs text-foreground-muted">
            Totals are calculated by Bambino’s server; the price you pay is the total shown.
          </p>
        </Card>
      </aside>
    </div>
  );
}

export function CheckoutView() {
  return <RequireAuth>{(viewer) => <Checkout viewer={viewer} />}</RequireAuth>;
}
