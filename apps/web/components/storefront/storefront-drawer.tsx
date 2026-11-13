'use client';

import { MoneyText, buttonClasses } from '@bambino/ui';
import { X } from 'lucide-react';
import NextLink from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { AddToCart } from '@/components/add-to-cart';
import { useCart } from '@/components/header-actions';
import { useSession } from '@/lib/session';
import { ProductPhoto } from './product-photo';
import { type Panel, useStorefront } from './storefront-context';

const THUMB = 'block size-20 shrink-0 overflow-hidden rounded-md border border-border';
const EMPTY_PANEL = 'flex flex-col items-start gap-2.5 px-5 py-8';
const EMPTY_TITLE = 'text-lg font-semibold';
const META = 'text-sm text-foreground-muted';

function CartContent() {
  const { viewer, loading } = useSession();
  const { openPanel } = useStorefront();
  const cart = useCart(viewer !== null);
  const close = () => openPanel(null);
  if (loading || (viewer && cart.isPending))
    return (
      <p className="p-5 text-foreground-muted" role="status">
        Opening your bag…
      </p>
    );
  if (!viewer)
    return (
      <div className={EMPTY_PANEL}>
        <p>Sign in to see your bag and check out.</p>
        <NextLink
          onClick={close}
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
        <p role="alert">We couldn’t load your bag. Open the bag page to try again.</p>
        <NextLink onClick={close} href="/cart" className={buttonClasses({ className: 'mt-2' })}>
          Open your bag
        </NextLink>
      </div>
    );
  if (!cart.data?.items.length)
    return (
      <div className={EMPTY_PANEL}>
        <p className={EMPTY_TITLE}>Your bag is empty</p>
        <p className="text-foreground-muted">Clothes you add wait here until you check out.</p>
        <NextLink href="/shop" onClick={close} className={buttonClasses({ className: 'mt-2' })}>
          Keep shopping
        </NextLink>
      </div>
    );
  return (
    <>
      <ul className="divide-y divide-border px-5">
        {cart.data.items.map((item) => (
          <li key={item.id} className="flex gap-3 py-4">
            <NextLink
              onClick={close}
              href={`/shop/${item.product.slug}`}
              tabIndex={-1}
              aria-hidden="true"
              className={THUMB}
            >
              <ProductPhoto src={item.product.images[0]?.url} alt="" sizes="80px" />
            </NextLink>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <NextLink
                onClick={close}
                href={`/shop/${item.product.slug}`}
                className="rounded-sm text-[15px] leading-snug font-medium"
              >
                {item.product.name}
              </NextLink>
              <p className={META}>
                Size {item.variant.size.code}, {item.variant.color}
              </p>
              <p className={META}>Quantity {item.quantity}</p>
              <MoneyText value={item.lineTotal} className="mt-auto block font-semibold" />
            </div>
          </li>
        ))}
      </ul>
      <div className="sticky bottom-0 mt-auto flex flex-col gap-2.5 border-t border-border bg-surface px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <p className="flex justify-between font-semibold">
          <span>Subtotal</span>
          <MoneyText value={cart.data.subtotal} />
        </p>
        <p className={META}>Delivery options and your total are shown at checkout.</p>
        <NextLink
          href="/checkout"
          onClick={close}
          className={buttonClasses({ fullWidth: true, size: 'lg', className: 'cta' })}
        >
          Checkout
        </NextLink>
        <NextLink
          href="/cart"
          onClick={close}
          className="self-center rounded-md py-2 text-[15px] font-medium underline underline-offset-4"
        >
          View and edit your bag
        </NextLink>
      </div>
    </>
  );
}

function SavedContent() {
  const { saved, removeSaved, openPanel } = useStorefront();
  const close = () => openPanel(null);
  if (!saved.length)
    return (
      <div className={EMPTY_PANEL}>
        <p className={EMPTY_TITLE}>No favourites yet</p>
        <p className="text-foreground-muted">
          Tap the heart on anything you like and it stays here, on this device.
        </p>
        <NextLink href="/shop" onClick={close} className={buttonClasses({ className: 'mt-2' })}>
          Keep shopping
        </NextLink>
      </div>
    );
  return (
    <div className="px-5 pb-6">
      <ul className="divide-y divide-border">
        {saved.map((item) => (
          <li key={item.id} className="flex gap-3 py-4">
            <NextLink
              onClick={close}
              href={`/shop/${item.slug}`}
              tabIndex={-1}
              aria-hidden="true"
              className={THUMB}
            >
              <ProductPhoto src={item.image} alt="" sizes="80px" />
            </NextLink>
            <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
              <NextLink
                onClick={close}
                href={`/shop/${item.slug}`}
                className="rounded-sm text-[15px] leading-snug font-medium"
              >
                {item.name}
              </NextLink>
              {item.price ? <MoneyText value={item.price} className="block font-semibold" /> : null}
              <button
                type="button"
                onClick={() => removeSaved(item.id)}
                className="mt-auto min-h-10 rounded-md text-sm font-medium underline underline-offset-4"
              >
                Remove<span className="sr-only"> {item.name} from favourites</span>
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p className={`pt-3 ${META}`}>Favourites are saved on this device.</p>
    </div>
  );
}

/** Sizes and colours of the product a shopper tapped "Choose options" on, without leaving the grid. */
function OptionsContent() {
  const { options, openPanel } = useStorefront();
  if (!options) return null;
  return (
    <div className="flex flex-col gap-5 px-5 py-5">
      <div className="flex gap-3">
        <span className={THUMB}>
          <ProductPhoto src={options.images[0]?.url} alt="" sizes="80px" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="leading-snug font-medium">{options.name}</p>
          {options.priceFrom ? <MoneyText value={options.priceFrom} className="font-semibold" /> : null}
          <NextLink
            href={`/shop/${options.slug}`}
            onClick={() => openPanel(null)}
            className="mt-auto rounded-sm text-sm font-medium underline underline-offset-4"
          >
            See full details
          </NextLink>
        </div>
      </div>
      <AddToCart key={options.id} variants={options.variants} oneTimeEligible layout="panel" />
    </div>
  );
}

const TITLES = { saved: 'Your favourites', cart: 'Your bag', options: 'Choose options' } as const;

/** Native modal provides Escape, inert background, focus containment and return to its trigger. */
export function StorefrontDrawer() {
  const { panel, openPanel } = useStorefront();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // Keep showing the last panel while the dialog slides shut, so it never closes empty.
  const [shown, setShown] = useState<Exclude<Panel, null>>('cart');
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
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface py-2 pr-3 pl-5">
          <h2 id={titleId} className="text-lg font-semibold">
            {TITLES[shown]}
          </h2>
          <button
            type="button"
            aria-label="Close panel"
            className="retail-icon-button"
            onClick={() => openPanel(null)}
          >
            <X className="size-5" strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
        {shown === 'options' ? <OptionsContent /> : shown === 'saved' ? <SavedContent /> : <CartContent />}
      </div>
    </dialog>
  );
}
