import '@/index.css';
import Providers from '@/components/Providers';
import { ReactNode } from 'react';

export const metadata = {
  title: {
    default: 'Learn NSE Play - Paper Trading Platform',
    template: '%s | Learn NSE Play'
  },
  description: 'Master stock trading with our advanced paper trading platform. Practice NSE trading with virtual money, real-time data, and comprehensive analytics.',
  keywords: ['NSE', 'paper trading', 'stock trading', 'virtual trading', 'trading platform', 'learn trading'],
  authors: [{ name: 'Learn NSE Play Team' }],
  creator: 'Learn NSE Play',
  publisher: 'Learn NSE Play',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://learn-nse-play.com',
    title: 'Learn NSE Play - Paper Trading Platform',
    description: 'Master stock trading with our advanced paper trading platform.',
    siteName: 'Learn NSE Play',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Learn NSE Play - Paper Trading Platform',
    description: 'Master stock trading with our advanced paper trading platform.',
    creator: '@learnnseplay',
  },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
