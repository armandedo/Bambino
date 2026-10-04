import type { Metadata } from 'next';
import { Inter, Manrope } from 'next/font/google';
import type { ReactNode } from 'react';
import { AdminProviders } from '@/lib/session';
import './globals.css';

const display = Manrope({ subsets: ['latin'], variable: '--font-manrope', display: 'swap' });
const sans = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Bambino admin', template: '%s · Bambino admin' },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body>
        <AdminProviders>{children}</AdminProviders>
      </body>
    </html>
  );
}
