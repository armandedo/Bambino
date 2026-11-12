import type { Metadata } from 'next';
import { CheckoutView } from './checkout-view';

export const metadata: Metadata = { title: 'Checkout', robots: { index: false } };

export default function CheckoutPage() {
  return (
    <div className="retail-container flex flex-col gap-8 py-8 sm:py-12">
      <h1 className="font-display text-4xl font-bold tracking-[-.045em]">Checkout</h1>
      <CheckoutView />
    </div>
  );
}
