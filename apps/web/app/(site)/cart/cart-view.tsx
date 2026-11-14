'use client';

import { type Cart, RemoveFromCartMutation, UpdateCartItemMutation } from '@bambino/api-client';
import { Alert, Button, EmptyState, MoneyText, Skeleton, buttonClasses } from '@bambino/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import NextLink from 'next/link';
import { CART_KEY, useCart } from '@/components/header-actions';
import { ProductPhoto } from '@/components/storefront/product-photo';
import { RequireAuth } from '@/components/require-auth';
import { api } from '@/lib/browser-api';
import { errorMessage } from '@/lib/messages';
import { displaySizeLabel } from '@/lib/size-label';

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
      <Alert tone="danger" title="We couldn't load your bag" live>
        {errorMessage(cart.error)}
      </Alert>
    );
  }
  const data = cart.data;
  if (!data || data.items.length === 0) {
    return (
      <EmptyState
        title="Your bag is empty"
        description="Clothes you add wait here until you check out."
        action={
          <NextLink href="/shop" className={buttonClasses()}>
            Keep shopping
          </NextLink>
        }
      />
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10">
      <section aria-labelledby="items">
        <h2 id="items" className="sr-only">
          Items
        </h2>
        {update.isError ? (
          <Alert tone="danger" live className="mb-3">
            {errorMessage(update.error)}
          </Alert>
        ) : null}
        <ul className="divide-y divide-border border-y border-border">
          {data.items.map((item) => (
            <li key={item.id} className="flex gap-3 py-4">
              <NextLink
                href={`/shop/${item.product.slug}`}
                tabIndex={-1}
                aria-hidden="true"
                className="block size-24 shrink-0 overflow-hidden rounded-md border border-border"
              >
                <ProductPhoto src={item.product.images[0]?.url} alt="" sizes="96px" />
              </NextLink>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-start justify-between gap-3">
                  <NextLink
                    href={`/shop/${item.product.slug}`}
                    className="rounded-sm text-[15px] leading-snug font-medium hover:underline"
                  >
                    {item.product.name}
                  </NextLink>
                  <MoneyText value={item.lineTotal} className="shrink-0 font-semibold" />
                </div>
                <p className="text-sm text-foreground-muted">
                  Size {displaySizeLabel(item.variant.size.label)}, {item.variant.color}
                </p>
                <p className="text-sm text-foreground-muted">
                  <MoneyText value={item.variant.price} /> each
                </p>
                {!item.variant.inStock ? (
                  <p className="text-sm font-medium text-danger">
                    No longer in stock. Remove it to check out.
                  </p>
                ) : null}
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
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
                    Remove<span className="sr-only"> {item.product.name}</span>
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <aside aria-labelledby="summary" className="lg:sticky lg:top-24 lg:self-start">
        <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <h2 id="summary" className="text-lg font-semibold">
            Summary
          </h2>
          <div className="flex justify-between">
            <span>
              Subtotal ({data.itemCount} {data.itemCount === 1 ? 'item' : 'items'})
            </span>
            <MoneyText value={data.subtotal} className="font-semibold" />
          </div>
          <p className="text-sm text-foreground-muted">Choose delivery and review your total at checkout.</p>
          <NextLink
            href="/checkout"
            className={buttonClasses({ fullWidth: true, size: 'lg', className: 'cta' })}
          >
            Go to checkout
          </NextLink>
          <NextLink
            href="/shop"
            className="self-center rounded-md py-1 text-sm font-medium underline underline-offset-4"
          >
            Keep shopping
          </NextLink>
        </div>
      </aside>
    </div>
  );
}

export function CartView() {
  return <RequireAuth>{() => <CartContents />}</RequireAuth>;
}
