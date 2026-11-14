'use client';

import { AddToCartMutation, type ProductDetail } from '@bambino/api-client';
import { Alert, Button, MoneyText, buttonClasses, cn, useToast } from '@bambino/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import NextLink from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/browser-api';
import { errorMessage } from '@/lib/messages';
import { displaySizeLabel } from '@/lib/size-label';
import { useSession } from '@/lib/session';
import { CART_KEY } from './header-actions';
import { useStorefront } from './storefront/storefront-context';

type Variant = Pick<ProductDetail['variants'][number], 'id' | 'color' | 'inStock' | 'price' | 'size'>;

const LEGEND = 'mb-2 text-[15px] font-semibold';
const CHOICE =
  'relative flex min-h-11 items-center justify-center rounded-md border px-3 text-center text-[15px] transition-colors has-focus-visible:outline-[3px] has-focus-visible:outline-offset-2 has-focus-visible:outline-primary';
const CHOICE_ON = 'cursor-pointer border-primary bg-primary font-semibold text-primary-foreground';
const CHOICE_OFF = 'cursor-pointer border-border-strong bg-surface font-medium hover:bg-accent-soft';
const CHOICE_GONE = 'cursor-not-allowed border-dashed border-border bg-surface-muted text-foreground-muted';

/** Puts one piece in the bag, shows the bag, and says so. Used by the product page, the options panel and cards. */
export function useAddToBag() {
  const { openPanel } = useStorefront();
  const toast = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variantId: string) => api.request(AddToCartMutation, { variantId, quantity: 1 }),
    onSuccess: ({ addToCart }) => {
      queryClient.setQueryData(CART_KEY, addToCart);
      toast.show({ title: 'Added to your bag', tone: 'success' });
      openPanel('cart');
    },
  });
}

/** Where to send a signed-out shopper, so they come back to the page (and filters) they were on. */
export function useSignInHref() {
  const pathname = usePathname();
  const router = useRouter();
  const { openPanel } = useStorefront();
  return {
    href: `/login?next=${encodeURIComponent(pathname)}`,
    onClick(event: { preventDefault: () => void }) {
      event.preventDefault();
      openPanel(null);
      const here = `${window.location.pathname}${window.location.search}`;
      router.push(`/login?next=${encodeURIComponent(here)}`);
    },
  };
}

/**
 * Size and colour choice plus "Add to bag". Prices shown come from the server; the bag re-prices on every read.
 * On the product page the button is pinned to the bottom of a phone screen; inside the options panel it sits
 * under the sizes.
 */
export function AddToCart({
  variants,
  oneTimeEligible,
  layout = 'page',
}: {
  variants: Variant[];
  oneTimeEligible: boolean;
  layout?: 'page' | 'panel';
}) {
  const { viewer } = useSession();
  const signIn = useSignInHref();
  const colors = [...new Set(variants.map((v) => v.color))];
  const [color, setColor] = useState(colors[0] ?? '');
  const forColor = variants
    .filter((v) => v.color === color)
    .sort((a, b) => a.size.sortOrder - b.size.sortOrder);
  const only = variants.length === 1 && variants[0]?.inStock ? variants[0].id : null;
  const [variantId, setVariantId] = useState<string | null>(only);
  const selected = forColor.find((v) => v.id === variantId) ?? null;
  const soldOut = variants.every((v) => !v.inStock);
  const add = useAddToBag();

  return (
    <div className="flex flex-col gap-5">
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
        <div className="flex flex-wrap gap-2">
          {forColor.map((variant) => {
            const on = variant.id === variantId;
            return (
              <label
                key={variant.id}
                className={cn(
                  CHOICE,
                  'min-w-[4.5rem] flex-col gap-0.5 py-1.5',
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
                <span className="flex items-center gap-1 whitespace-nowrap">
                  {on ? <Check className="count-pop size-4" strokeWidth={2.4} aria-hidden="true" /> : null}
                  {displaySizeLabel(variant.size.label)}
                </span>
                {!variant.inStock ? <span className="text-xs font-normal">Sold out</span> : null}
              </label>
            );
          })}
        </div>
        <p className="mt-2.5 text-sm text-foreground-muted">
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

      <div
        className={cn(
          'flex items-center gap-4',
          layout === 'page' &&
            'buy-bar fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface px-[var(--gutter)] pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-bar lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none',
        )}
      >
        {selected && layout === 'page' ? (
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
          ) : soldOut ? (
            <p className="py-2 text-[15px] text-foreground-muted">Every size is sold out right now.</p>
          ) : viewer ? (
            <Button
              size="lg"
              fullWidth
              disabled={!selected}
              loading={add.isPending}
              className="cta"
              onClick={() => selected && add.mutate(selected.id)}
            >
              {selected ? 'Add to bag' : 'Choose a size'}
            </Button>
          ) : (
            <NextLink
              href={signIn.href}
              onClick={signIn.onClick}
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
