import type { Metadata } from 'next';
import { Bricolage_Grotesque } from 'next/font/google';
import type { ReactNode } from 'react';
import { AdminProviders } from '@/lib/session';
import './globals.css';

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  axes: ['opsz', 'wdth'],
  variable: '--font-bricolage',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Bambino admin', template: '%s · Bambino admin' },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={bricolage.variable}>
      <body>
        <AdminProviders>{children}</AdminProviders>
      </body>
    </html>
  );
}
