import { type ReactNode, Suspense } from 'react';
import { AdminFrame } from '@/components/admin-frame';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AdminFrame>
      <Suspense>{children}</Suspense>
    </AdminFrame>
  );
}
