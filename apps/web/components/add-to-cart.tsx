'use client';

import { AddToCartMutation, type ProductDetail } from '@bambino/api-client';
import { Alert, Button, buttonClasses, cn, useToast } from '@bambino/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/browser-api';
import { errorMessage } from '@/lib/messages';
import { useSession } from '@/lib/session';
import { CART_KEY } from './header-actions';

type Variant = ProductDetail['variants'][number];

/** Size and colour choice plus "Add to cart". Prices shown come from the server; the cart re-prices on every read. */
export function AddToCart({ variants, oneTimeEligible }: { variants: Variant[]; oneTimeEligible: boolean }) {
  const { viewer } = useSession();
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
    },
  });

  return (
    <div className="flex flex-col gap-4">
      {colors.length > 1 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-display text-lg font-semibold">Colour</legend>
          <div className="flex flex-wrap gap-2">
            {colors.map((c) => (
              <label
                key={c}
                className={cn(
                  buttonClasses({ size: 'sm', variant: c === color ? 'primary' : 'outline' }),
                  'cursor-pointer has-focus-visible:outline-2 has-focus-visible:outline-focus',
                )}
              >
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

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-display text-lg font-semibold">
          Size{' '}
          {colors.length === 1 ? (
            <span className="font-sans text-sm font-normal text-foreground-muted">· {color}</span>
          ) : null}
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {forColor.map((variant) => (
            <label
              key={variant.id}
              className={cn(
                'flex cursor-pointer flex-col rounded-lg border p-3 text-sm has-focus-visible:outline-2 has-focus-visible:outline-focus',
                variant.id === variantId
                  ? 'border-primary bg-primary-soft'
                  : 'border-border-strong bg-surface',
                !variant.inStock && 'cursor-not-allowed border-border bg-surface-muted text-foreground-muted',
              )}
            >
              <input
                type="radio"
                name="variant"
                value={variant.id}
                disabled={!variant.inStock}
                checked={variant.id === variantId}
                onChange={() => setVariantId(variant.id)}
                className="sr-only"
              />
              <span className="font-semibold">{variant.size.label}</span>
              <span>{variant.inStock ? 'In stock' : 'Sold out'}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {add.isError ? (
        <Alert tone="danger" live>
          {errorMessage(add.error)}
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {!oneTimeEligible ? (
          <p className="text-sm text-foreground-muted">This piece is available through subscriptions only.</p>
        ) : viewer ? (
          <Button
            size="lg"
            disabled={!selected}
            loading={add.isPending}
            onClick={() => selected && add.mutate(selected.id)}
          >
            {selected ? 'Add to cart' : 'Choose a size'}
          </Button>
        ) : (
          <NextLink
            href={`/login?next=${encodeURIComponent(pathname)}`}
            className={buttonClasses({ size: 'lg' })}
          >
            Sign in to buy
          </NextLink>
        )}
        <NextLink href="/plans" className={buttonClasses({ size: 'lg', variant: 'outline' })}>
          See plans
        </NextLink>
      </div>
    </div>
  );
}
