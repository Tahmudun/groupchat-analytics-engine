import type { ReactNode } from 'react';
import type { Viewport } from 'next';
import { Bebas_Neue } from 'next/font/google';
import { InstagramViewportFix } from './InstagramViewportFix';

const display = Bebas_Neue({ weight: '400', subsets: ['latin'], variable: '--font-display' });

export const metadata = {
  title: 'FLIX',
  description: 'The group chat, streaming now.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: '#141414',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={display.variable}>
      <body><InstagramViewportFix />{children}</body>
    </html>
  );
}
