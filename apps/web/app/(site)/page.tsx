import { type ShopSearchParams, ShopView } from '@/components/storefront/shop-view';

/** The home page is the shop: the first thing a visitor sees is clothes to browse. */
export default function HomePage({ searchParams }: { searchParams: ShopSearchParams }) {
  return <ShopView searchParams={searchParams} />;
}
