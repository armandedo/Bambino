import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { INTERNAL_PAGES_VISIBLE } from '@/lib/preview';
import { Gallery } from './gallery';

export const metadata: Metadata = { title: 'Design system' };

export default function DesignPage() {
  if (!INTERNAL_PAGES_VISIBLE) notFound();
  return <Gallery />;
}
