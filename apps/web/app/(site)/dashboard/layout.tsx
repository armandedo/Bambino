import type { Metadata } from 'next';
import { type ReactNode, Suspense } from 'react';
import { AccountFrame } from './account-nav';

export const metadata: Metadata = {
  title: { default: 'Your account', template: '%s · Your account · Bambino' },
  robots: { index: false },
};

export default function AccountLayout({ children }: { children: ReactNode }) {
  // Suspense lets pages read search params (for example ?placed=1) without opting the whole tree out of prerendering.
  return (
    <AccountFrame>
      <Suspense>{children}</Suspense>
    </AccountFrame>
  );
}
