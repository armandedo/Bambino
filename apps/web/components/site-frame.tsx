'use client';

import { ToastProvider } from '@bambino/ui';
import type { ReactNode } from 'react';
import { AppProviders } from '@/lib/session';
import { MotionProvider } from './motion/primitives';
import { SiteChrome } from './navigation/site-chrome';

export function SiteFrame({ children }: { children: ReactNode }) {
  return (
    <AppProviders>
      <MotionProvider>
        <ToastProvider>
          <SiteChrome>{children}</SiteChrome>
        </ToastProvider>
      </MotionProvider>
    </AppProviders>
  );
}
