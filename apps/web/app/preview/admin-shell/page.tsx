import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { INTERNAL_PAGES_VISIBLE } from '@/lib/preview';
import { AdminPreview } from './admin-preview';

export const metadata: Metadata = { title: 'Admin shell preview' };

export default function AdminShellPage() {
  if (!INTERNAL_PAGES_VISIBLE) notFound();
  return <AdminPreview />;
}
