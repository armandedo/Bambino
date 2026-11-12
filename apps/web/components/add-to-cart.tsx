'use client';

import { AddToCartMutation, type ProductDetail } from '@bambino/api-client';
import { Alert, Button, MoneyText, buttonClasses, cn, useToast } from '@bambino/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/browser-api';
import { errorMessage } from '@/lib/messages';
import { displaySizeLabel } from '@/lib/size-label';
import { useSession } from '@/lib/session';
import { CART_KEY } from './header-actions';
import { useStorefront } from './storefront/storefront-context';

type Variant = ProductDetail['variants'][number];

const LEGEND = 'mb-2.5 text-lg font-semibold';
const CHOICE =
  'relative flex min-h-12 items-center justify-center rounded-xl border px-4 text-center transition-colors has-focus-visible:outline-[3px] has-focus-visible:outline-offset-[3px] has-focus-visible:outline-primary';
const CHOICE_ON = 'cursor-pointer border-primary bg-primary font-semibold text-primary-foreground';
const CHOICE_OFF = 'cursor-pointer border-border-strong bg-surface font-medium hover:bg-accent-soft';
const CHOICE_GONE = 'cursor-not-allowed border-dashed border-border bg-surface-muted text-foreground-muted';

/** Size and colour choice plus "Add to cart". Prices shown come from the server; the cart re-prices on every read. */
export function AddToCart({ variants, oneTimeEligible }: { variants: Variant[]; oneTimeEligible: boolean }) {
  const { viewer } = useSession();
  const { openPanel } = useStorefront();
  const pathname = usePathname();
  const toast = useToast();
  const queryClient = useQueryClient();
  const colors = [...new Set(variants.map((v) => v.color))];
  const [color, setColor] = useState(colors[0] ?? '');
  const forColor = variants
    .filter((v) => v.color === color)
    .sort((a, b) => a.size.sortOrder - b.size.sortOrder);
  const [variantId, setVariantId] = useState<string | null>(null);
  const selected = forColor.find((v) => v.id === variantId) ?? null;

  const add = useMutation({
    mutationFn: (id: string) => api.request(AddToCartMutation, { variantId: id, quantity: 1 }),
    onSuccess: ({ addToCart }) => {
      queryClient.setQueryData(CART_KEY, addToCart);
      toast.show({ title: 'Added to your cart', tone: 'success' });
      openPanel('cart');
    },
  });

  return (
    <div className="flex flex-col gap-6">
      {colors.length > 1 ? (
        <fieldset>
          <legend className={LEGEND}>Colour</legend>
          <div className="flex flex-wrap gap-2">
            {colors.map((c) => (
              <label key={c} className={cn(CHOICE, c === color ? CHOICE_ON : CHOICE_OFF)}>
                <input
                  type="radio"
                  name="color"
                  value={c}
                  checked={c === color}
                  onChange={() => {
                    setColor(c);
                    setVariantId(null);
                  }}
                  className="sr-only"
                />
                {c}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <fieldset>
        <legend className={LEGEND}>
          Size
          {colors.length === 1 && color ? (
            <span className="font-normal text-foreground-muted">, {color}</span>
          ) : null}
        </legend>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-3 xl:grid-cols-4">
          {forColor.map((variant) => {
            const on = variant.id === variantId;
            return (
              <label
                key={variant.id}
                className={cn(
                  CHOICE,
                  'flex-col gap-0.5 py-2',
                  !variant.inStock ? CHOICE_GONE : on ? CHOICE_ON : CHOICE_OFF,
                )}
              >
                <input
                  type="radio"
                  name="variant"
                  value={variant.id}
                  disabled={!variant.inStock}
                  checked={on}
                  onChange={() => setVariantId(variant.id)}
                  className="sr-only"
                />
                <span className="flex items-center gap-1.5">
                  {on ? <Check className="count-pop size-4" strokeWidth={2.4} aria-hidden="true" /> : null}
                  {displaySizeLabel(variant.size.label)}
                </span>
                {!variant.inStock ? <span className="text-[13px] font-normal">Sold out</span> : null}
              </label>
            );
          })}
        </div>
        <p className="mt-3 text-[15px] text-foreground-muted">
          Not sure which size?{' '}
          <NextLink
            href="/fit"
            className="rounded-sm font-medium text-foreground underline underline-offset-4"
          >
            Find their size
          </NextLink>
        </p>
      </fieldset>

      {add.isError ? (
        <Alert tone="danger" live>
          {errorMessage(add.error)}
        </Alert>
      ) : null}

      {/* Phones: pinned above the bottom bar, so the button is always in reach. Desktop: in the column. */}
      <div className="buy-bar fixed inset-x-0 bottom-[var(--bottom-nav)] z-30 flex items-center gap-4 border-t border-border bg-surface px-[var(--gutter)] py-3 shadow-bar lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
        {selected ? (
          <div className="min-w-0 shrink-0 lg:hidden">
            <span className="block text-sm text-foreground-muted">Size {selected.size.code}</span>
            <MoneyText value={selected.price} className="font-semibold" />
          </div>
        ) : null}
        <div className="flex min-w-0 flex-1">
          {!oneTimeEligible ? (
            <p className="py-2 text-[15px] text-foreground-muted">
              This piece is not available to buy right now.
            </p>
          ) : viewer ? (
            <Button
              size="lg"
              fullWidth
              disabled={!selected}
              loading={add.isPending}
              className="cta"
              onClick={() => selected && add.mutate(selected.id)}
            >
              {selected ? 'Add to cart' : 'Choose a size'}
            </Button>
          ) : (
            <NextLink
              href={`/login?next=${encodeURIComponent(pathname)}`}
              className={buttonClasses({ size: 'lg', fullWidth: true, className: 'cta' })}
            >
              Sign in to buy
            </NextLink>
          )}
        </div>
      </div>
    </div>
  );
}
