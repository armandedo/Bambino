import type { Metadata } from 'next';
import { CheckoutView } from './checkout-view';

export const metadata: Metadata = { title: 'Checkout', robots: { index: false } };

export default function CheckoutPage() {
  return (
    <div className="retail-container flex flex-col gap-4 pt-4 pb-10">
      <h1 className="text-xl font-semibold tracking-[-0.01em]">Checkout</h1>
      <CheckoutView />
    </div>
  );
}
