import type { ReactNode } from 'react';
import { SiteFrame } from '@/components/site-frame';
import { CatalogueFiltersQuery } from '@bambino/api-client';
import { load } from '@/lib/api';

export default async function SiteLayout({ children }: { children: ReactNode }) {
  const filters = await load(CatalogueFiltersQuery);
  return <SiteFrame categories={filters.ok ? filters.data.categories : []}>{children}</SiteFrame>;
}
