'use client';

import { MyCartQuery } from '@bambino/api-client';
import { buttonClasses } from '@bambino/ui';
import { useQuery } from '@tanstack/react-query';
import NextLink from 'next/link';
import { api } from '@/lib/browser-api';
import { useSession } from '@/lib/session';

export const CART_KEY = ['cart'] as const;

export function useCart(enabled: boolean) {
  return useQuery({
    queryKey: CART_KEY,
    queryFn: async () => (await api.request(MyCartQuery)).myCart,
    enabled,
  });
}

/** Header right side: cart with item count, and the account link or sign-in. */
export function HeaderActions() {
  const { viewer, loading } = useSession();
  const cart = useCart(viewer !== null);
  const count = cart.data?.itemCount ?? 0;

  if (loading) return <span className="h-9 w-24" aria-hidden="true" />;
  if (!viewer) {
    return (
      <>
        <NextLink href="/login" className={buttonClasses({ size: 'sm', variant: 'ghost' })}>
          Sign in
        </NextLink>
        <NextLink
          href="/register"
          className={buttonClasses({ size: 'sm', className: 'hidden sm:inline-flex' })}
        >
          Join
        </NextLink>
      </>
    );
  }
  return (
    <>
      <NextLink
        href="/cart"
        className={buttonClasses({ size: 'sm', variant: 'ghost', className: 'relative' })}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
        >
          <path
            d="M5 7h14l-1.4 11.2a2 2 0 0 1-2 1.8H8.4a2 2 0 0 1-2-1.8L5 7Zm3 0a4 4 0 0 1 8 0"
            strokeLinejoin="round"
          />
        </svg>
        <span>Cart</span>
        {count > 0 ? (
          <span className="rounded-full bg-accent px-1.5 text-xs font-bold text-accent-foreground">
            {count}
            <span className="sr-only"> {count === 1 ? 'item' : 'items'}</span>
          </span>
        ) : null}
      </NextLink>
      <NextLink href="/account" className={buttonClasses({ size: 'sm', variant: 'outline' })}>
        {viewer.firstName}
        <span className="sr-only">: your account</span>
      </NextLink>
    </>
  );
}
