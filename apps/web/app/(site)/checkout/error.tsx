'use client';

import NextLink from 'next/link';
import { RouteError, type RouteErrorValue } from '@/components/route-error';

export default function CheckoutError({ error, retry }: { error: RouteErrorValue; retry: () => void }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-16">
      <RouteError error={error} retry={retry} what="checkout" />
      {/* A mobile-money payment can be approved on the phone even when this page fails afterwards. */}
      <p className="text-center text-sm text-foreground-muted">
        Your cart is saved. If you already approved a payment on your phone, check{' '}
        <NextLink
          href="/dashboard/payments"
          className="text-link underline underline-offset-4 hover:decoration-2"
        >
          your payments
        </NextLink>{' '}
        before paying again.
      </p>
    </div>
  );
}
