import type { ReactNode } from 'react';
import { colors } from '@hanzo/design';
import './globals.css';

export const metadata = {
  metadataBase: new URL('https://tabs.hanzo.ai'),
  title: { default: 'Hanzo Tabs', template: '%s — Hanzo Tabs' },
  description: 'Keep tabs on your agents. A browser terminal workspace for machines you have linked.',
  // Both files are the Hanzo mark from @hanzo/brand, copied into public/. The
  // .ico is here because a browser asks for /favicon.ico whether or not a page
  // declares one, and the bucket has no server to answer that with anything
  // else — an undeclared icon is a 404 and a blank tab.
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: '48x48' },
    ],
  },
  openGraph: {
    title: 'Hanzo Tabs — keep tabs on your agents',
    description: 'Every shell your coding agents work in, split and tiled, from anywhere.',
    url: 'https://tabs.hanzo.ai',
    siteName: 'Hanzo Tabs',
  },
};

export const viewport = {
  // The browser chrome paints this before any stylesheet loads, so it is the one
  // colour that cannot be a var() — it has to be a literal. Taking it from the
  // token module rather than typing one keeps it the SAME literal the page then
  // paints, which is what stops the address bar and the page disagreeing.
  themeColor: colors.background,
  // The workspace is full-bleed and the terminal owns the bottom edge.
  viewportFit: 'cover' as const,
  width: 'device-width',
  initialScale: 1,
};

// No theme class on <html>: the tokens ARE the dark values at :root, and
// `.light` is what inverts them. A `dark` class selects nothing in either the
// design system or Tailwind here, so carrying one only suggests a switch that
// does not exist.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
