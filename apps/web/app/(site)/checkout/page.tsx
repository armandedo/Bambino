import type { Metadata } from 'next';
import { CheckoutView } from './checkout-view';

export const metadata: Metadata = { title: 'Checkout', robots: { index: false } };

export default function CheckoutPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12">
      <h1 className="font-display text-4xl font-semibold">Checkout</h1>
      <CheckoutView />
    </div>
  );
}
