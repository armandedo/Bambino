import type { Metadata } from 'next';
import { AdminPreview } from './admin-preview';

export const metadata: Metadata = { title: 'Admin shell preview' };

export default function AdminShellPage() {
  return <AdminPreview />;
}
