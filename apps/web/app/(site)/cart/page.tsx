import type { Metadata } from 'next';
import { CartView } from './cart-view';

export const metadata: Metadata = { title: 'Cart', robots: { index: false } };

export default function CartPage() {
  return (
    <div className="retail-container flex flex-col gap-8 py-8 sm:py-12">
      <div className="border-b border-border pb-7">
        <h1 className="font-display text-4xl font-bold tracking-[-.045em] sm:text-5xl">Your shopping bag</h1>
        <p className="mt-3 text-base text-foreground-muted">Lovely little finds, ready when you are.</p>
      </div>
      <CartView />
    </div>
  );
}
