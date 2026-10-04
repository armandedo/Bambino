import type { Metadata } from 'next';
import { type ReactNode, Suspense } from 'react';
import { AccountFrame } from '../dashboard/account-nav';

export const metadata: Metadata = { title: 'Account settings', robots: { index: false } };

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <AccountFrame>
      <Suspense>{children}</Suspense>
    </AccountFrame>
  );
}
