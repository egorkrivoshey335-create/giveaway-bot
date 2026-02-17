import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
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

  const titles: Record<Locale, string> = {
    ru: 'RandomBeast — Честные розыгрыши в Telegram',
    en: 'RandomBeast — Fair Giveaways in Telegram',
    kk: 'RandomBeast — Telegram-дағы әділ ұтыс ойындар',
  };

  const descriptions: Record<Locale, string> = {
    ru: 'Создавайте прозрачные розыгрыши с проверкой подписок, бустов и честным выбором победителей.',
    en: 'Create transparent giveaways with subscription verification, boosts, and fair winner selection.',
    kk: 'Жазылымды тексерумен, бустармен және әділ жеңімпаздарды таңдаумен мөлдір ұтыс ойындарын құрыңыз.',
  };

  // Получаем базовый URL (в продакшене это будет реальный домен)
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://example.com';

  return {
    title: titles[locale],
    description: descriptions[locale],
    keywords: ['giveaway', 'telegram', 'розыгрыш', 'конкурс', 'ұтыс ойыны'],
    alternates: {
      canonical: `${baseUrl}/${locale === 'ru' ? '' : locale}`,
      languages: {
        'ru': `${baseUrl}`,
        'en': `${baseUrl}/en`,
        'kk': `${baseUrl}/kk`,
      },
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
