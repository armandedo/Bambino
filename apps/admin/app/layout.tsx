import type { Metadata } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import { AdminProviders } from '@/lib/session';
import './globals.css';

// Self-hosted (Space Grotesk, SIL Open Font License 1.1): the build never downloads a font, and the visitor's
// browser never contacts Google. A variable font file covering weights 300 to 700, Latin subset.
const spaceGrotesk = localFont({
  src: './fonts/SpaceGrotesk-latin.woff2',
  weight: '300 700',
  style: 'normal',
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
