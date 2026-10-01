import type { Metadata } from 'next';
import { CartView } from './cart-view';

export const metadata: Metadata = { title: 'Cart', robots: { index: false } };

export default function CartPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12">
      <h1 className="font-display text-4xl font-extrabold">Your cart</h1>
      <CartView />
    </div>
  );
}
