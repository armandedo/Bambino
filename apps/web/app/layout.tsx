import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque } from 'next/font/google';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import './globals.css';

// Self-hosted at build time by next/font: no request to Google from the visitor's browser.
const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  axes: ['opsz', 'wdth'],
  variable: '--font-bricolage',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Bambino: babywear that grows with your baby', template: '%s · Bambino' },
  description:
    'A babywear subscription for families in Rwanda: the right size delivered, swapped when your baby grows, and reused.',
  // Preview build: keep it out of search engines until launch.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#16213A',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Render every page per request: the CSP nonce set by proxy.ts must be in the HTML, and a page built ahead of
  // time has none. API data is still cached by each fetch's own `revalidate`.
  await connection();
  return (
    <html lang="en" className={bricolage.variable}>
      <body>{children}</body>
    </html>
  );
}
