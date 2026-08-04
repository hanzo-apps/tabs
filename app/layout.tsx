import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  metadataBase: new URL('https://tabs.hanzo.ai'),
  title: { default: 'Hanzo Tabs', template: '%s — Hanzo Tabs' },
  description: 'Keep tabs on your agents. A browser terminal workspace for machines you have linked.',
  openGraph: {
    title: 'Hanzo Tabs — keep tabs on your agents',
    description: 'Every shell your coding agents work in, split and tiled, from anywhere.',
    url: 'https://tabs.hanzo.ai',
    siteName: 'Hanzo Tabs',
  },
};

export const viewport = {
  themeColor: '#000000',
  // The workspace is full-bleed and the terminal owns the bottom edge.
  viewportFit: 'cover' as const,
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-dvh bg-neutral-950 text-neutral-200 antialiased">{children}</body>
    </html>
  );
}
