import type { Metadata } from 'next';
import { Space_Grotesk } from 'next/font/google';
import type { ReactNode } from 'react';
import { AdminProviders } from '@/lib/session';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-grotesk',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Bambino admin', template: '%s · Bambino admin' },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={spaceGrotesk.variable}>
      <body>
        <AdminProviders>{children}</AdminProviders>
      </body>
    </html>
  );
}
