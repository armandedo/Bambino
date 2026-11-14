'use client';

import { ToastProvider } from '@bambino/ui';
import type { CategorySummary } from '@bambino/api-client';
import type { ReactNode } from 'react';
import { AppProviders } from '@/lib/session';
import { SiteChrome } from './navigation/site-chrome';

export function SiteFrame({
  children,
  categories = [],
}: {
  children: ReactNode;
  categories?: CategorySummary[];
}) {
  return (
    <AppProviders>
      <ToastProvider>
        <SiteChrome categories={categories}>{children}</SiteChrome>
      </ToastProvider>
    </AppProviders>
  );
}
