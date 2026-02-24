import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { locales, type Locale } from '@/i18n/config';
import '../globals.css';

const inter = Inter({ subsets: ['latin', 'cyrillic'] });

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: { locale: Locale };
}): Promise<Metadata> {
  const { locale } = await params;

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://randombeast.ru';
  const canonicalUrl = locale === 'ru' ? baseUrl : `${baseUrl}/${locale}`;

  const titles: Record<Locale, string> = {
    ru: 'RandomBeast — Честные розыгрыши в Telegram',
    en: 'RandomBeast — Fair Giveaways in Telegram',
    kk: 'RandomBeast — Telegram-дағы әділ ұтыс ойындар',
  };

  const descriptions: Record<Locale, string> = {
    ru: 'Создавайте прозрачные розыгрыши в Telegram с проверкой подписок, защитой от ботов и красивым объявлением победителей.',
    en: 'Create transparent Telegram giveaways with subscription verification, bot protection and beautiful winner announcements.',
    kk: 'Жазылымды тексерумен, бот қорғанысымен және әдемі жеңімпаздарды жариялаумен Telegram-да мөлдір ұтыс ойындарын жасаңыз.',
  };

  return {
    title: {
      default: titles[locale],
      template: `%s | RandomBeast`,
    },
    description: descriptions[locale],
    keywords: ['giveaway', 'telegram', 'розыгрыш', 'конкурс', 'рандомайзер', 'ұтыс ойыны', 'RandomBeast'],
    authors: [{ name: 'RandomBeast', url: baseUrl }],
    creator: 'RandomBeast',
    publisher: 'RandomBeast',
    metadataBase: new URL(baseUrl),
    alternates: {
      canonical: canonicalUrl,
      languages: {
        'ru': baseUrl,
        'en': `${baseUrl}/en`,
        'kk': `${baseUrl}/kk`,
      },
    },
    openGraph: {
      type: 'website',
      locale: locale === 'ru' ? 'ru_RU' : locale === 'en' ? 'en_US' : 'kk_KZ',
      url: canonicalUrl,
      siteName: 'RandomBeast',
      title: titles[locale],
      description: descriptions[locale],
      images: [
        {
          url: `${baseUrl}/og-image.png`,
          width: 1200,
          height: 630,
          alt: 'RandomBeast — Честные розыгрыши в Telegram',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: titles[locale],
      description: descriptions[locale],
      images: [`${baseUrl}/og-image.png`],
      creator: '@BeastRandomBot',
    },
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
    icons: {
      icon: [
        { url: '/favicon.ico', sizes: '32x32' },
        { url: '/favicon-192.png', sizes: '192x192', type: 'image/png' },
      ],
      apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
      other: [{ rel: 'manifest', url: '/manifest.json' }],
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const { locale } = await params;

  // Ensure valid locale
  if (!locales.includes(locale as Locale)) {
    notFound();
  }

  // Enable static rendering for all child pages
  setRequestLocale(locale);

  // Get messages for this locale
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className={inter.className}>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
