import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Script from 'next/script';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { FullscreenInit } from '@/components/FullscreenInit';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { NetworkErrorHandler } from '@/components/NetworkErrorHandler';
import { SWRProvider } from '@/components/SWRProvider';
import { LoadingScreen } from '@/components/LoadingScreen';

const inter = Inter({ subsets: ['latin', 'cyrillic'] });

export const metadata: Metadata = {
  title: 'RandomBeast Mini App',
  description: 'Честные розыгрыши в Telegram',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <head>
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
      </head>
      <body className={`${inter.className} bg-tg-bg text-tg-text`}>
        <LoadingScreen />
        <FullscreenInit />
        <ErrorBoundary>
          <NextIntlClientProvider locale={locale} messages={messages}>
            <SWRProvider>
              <NetworkErrorHandler>
                {children}
              </NetworkErrorHandler>
            </SWRProvider>
          </NextIntlClientProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
