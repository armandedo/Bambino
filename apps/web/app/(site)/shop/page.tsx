import type { Metadata } from 'next';
import { type ShopSearchParams, ShopView } from '@/components/storefront/shop-view';

export const metadata: Metadata = { title: 'Shop' };

/** Filters, sorting and the page being shown all live in the address, so results can be shared. */
export default function ShopPage({ searchParams }: { searchParams: ShopSearchParams }) {
  return <ShopView searchParams={searchParams} />;
}
