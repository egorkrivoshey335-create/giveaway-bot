import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin', 'cyrillic'] });

export const metadata: Metadata = {
  title: 'RandomBeast — Честные розыгрыши в Telegram',
  description:
    'Создавайте прозрачные розыгрыши с проверкой подписок, бустов и честным выбором победителей.',
  keywords: ['розыгрыш', 'telegram', 'конкурс', 'giveaway', 'бот'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
