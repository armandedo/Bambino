import { ProductsQuery } from '@bambino/api-client';
import type { MetadataRoute } from 'next';
import { load } from '@/lib/api';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const revalidate = 3600;

/** Public pages and every active product. If the API is down, the static pages are still listed. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = ['/', '/shop', '/subscriptions', '/size-finder'].map((path) => ({
    url: `${SITE_URL}${path}`,
  }));
  const products = await load(ProductsQuery, { first: 100 });
  const productPages = products.ok
    ? products.data.products.edges.map(({ node }) => ({ url: `${SITE_URL}/shop/${node.slug}` }))
    : [];
  return [...pages, ...productPages];
}
