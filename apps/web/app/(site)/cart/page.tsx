import type { Metadata } from 'next';
import { CartView } from './cart-view';

export const metadata: Metadata = { title: 'Your bag', robots: { index: false } };

export default function CartPage() {
  return (
    <div className="retail-container flex flex-col gap-4 pt-4 pb-10">
      <h1 className="text-xl font-semibold tracking-[-0.01em]">Your bag</h1>
      <CartView />
    </div>
  );
}
