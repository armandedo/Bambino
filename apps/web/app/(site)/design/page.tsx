import type { Metadata } from 'next';
import { Gallery } from './gallery';

export const metadata: Metadata = { title: 'Design system' };

export default function DesignPage() {
  return <Gallery />;
}
