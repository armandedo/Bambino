'use client';

import { type Cart, RemoveFromCartMutation, UpdateCartItemMutation } from '@bambino/api-client';
import { Alert, Button, Card, EmptyState, MoneyText, Skeleton, buttonClasses } from '@bambino/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import NextLink from 'next/link';
import { CART_KEY, useCart } from '@/components/header-actions';
import { ProductArt } from '@/components/product-art';
import { RequireAuth } from '@/components/require-auth';
import { api } from '@/lib/browser-api';
import { errorMessage } from '@/lib/messages';

const MAX_QUANTITY = 10;

function CartContents() {
  const cart = useCart(true);
  const queryClient = useQueryClient();
  const update = useMutation({
    mutationFn: async (change: { itemId: string; quantity: number }) =>
      change.quantity <= 0
        ? (await api.request(RemoveFromCartMutation, { itemId: change.itemId })).removeFromCart
        : (await api.request(UpdateCartItemMutation, change)).updateCartItem,
    onSuccess: (next: Cart) => queryClient.setQueryData(CART_KEY, next),
  });

  if (cart.isPending) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  }
  if (cart.isError) {
    return (
      <Alert tone="danger" title="We couldn't load your cart" live>
        {errorMessage(cart.error)}
      </Alert>
    );
  }
  const data = cart.data;
  if (!data || data.items.length === 0) {
    return (
      <EmptyState
        title="Your cart is empty"
        description="Browse the shop and add pieces in your baby’s size."
        action={
          <NextLink href="/shop" className={buttonClasses()}>
            Go to the shop
          </NextLink>
        }
      />
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
      <section aria-labelledby="items">
        <h2 id="items" className="sr-only">
          Items
        </h2>
        {update.isError ? (
          <Alert tone="danger" live className="mb-4">
            {errorMessage(update.error)}
          </Alert>
        ) : null}
        <ul className="flex flex-col gap-3">
          {data.items.map((item) => (
            <li key={item.id}>
              <Card padding="sm" className="flex gap-4">
                <div className="w-20 shrink-0 overflow-hidden rounded-lg">
                  <ProductArt seed={item.product.slug} className="aspect-square" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <NextLink
                    href={`/shop/${item.product.slug}`}
                    className="font-semibold underline underline-offset-4 hover:decoration-2"
                  >
                    {item.product.name}
                  </NextLink>
                  <p className="text-sm text-foreground-muted">
                    {item.variant.size.label} · {item.variant.color} ·{' '}
                    <MoneyText value={item.variant.price} /> each
                  </p>
                  {!item.variant.inStock ? (
                    <p className="text-sm font-medium text-danger">
                      No longer in stock. Remove it to check out.
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <div
                      className="flex items-center rounded-full border border-border-strong"
                      role="group"
                      aria-label={`Quantity of ${item.product.name}`}
                    >
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Decrease quantity"
                        disabled={update.isPending}
                        onClick={() => update.mutate({ itemId: item.id, quantity: item.quantity - 1 })}
                      >
                        −
                      </Button>
                      <span className="min-w-8 text-center tabular-nums" aria-live="polite">
                        {item.quantity}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Increase quantity"
                        disabled={update.isPending || item.quantity >= MAX_QUANTITY}
                        onClick={() => update.mutate({ itemId: item.id, quantity: item.quantity + 1 })}
                      >
                        +
                      </Button>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={update.isPending}
                      onClick={() => update.mutate({ itemId: item.id, quantity: 0 })}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
                <p className="font-semibold">
                  <MoneyText value={item.lineTotal} />
                </p>
              </Card>
            </li>
          ))}
        </ul>
      </section>
      <aside aria-labelledby="summary">
        <Card className="flex flex-col gap-4 lg:sticky lg:top-24">
          <h2 id="summary" className="font-display text-xl font-bold">
            Summary
          </h2>
          <div className="flex justify-between">
            <span>
              Subtotal ({data.itemCount} {data.itemCount === 1 ? 'item' : 'items'})
            </span>
            <MoneyText value={data.subtotal} className="font-semibold" />
          </div>
          <p className="text-sm text-foreground-muted">
            Delivery, discounts and exchange credit are added at checkout.
          </p>
          <NextLink href="/checkout" className={buttonClasses({ fullWidth: true, size: 'lg' })}>
            Go to checkout
          </NextLink>
        </Card>
      </aside>
    </div>
  );
}

export function CartView() {
  return <RequireAuth>{() => <CartContents />}</RequireAuth>;
}
