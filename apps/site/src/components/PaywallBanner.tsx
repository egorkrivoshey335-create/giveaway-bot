import Link from 'next/link';
import { config } from '@/lib/config';

interface PaywallBannerProps {
  variant?: 'full' | 'compact';
}

export function PaywallBanner({ variant = 'full' }: PaywallBannerProps) {
  const botLink = `https://t.me/${config.botUsername}?start=buy_randomizer`;

  if (variant === 'compact') {
    return (
      <div className="bg-gradient-to-r from-brand-500 to-brand-600 rounded-xl p-6 text-white">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">Доступ к рандомайзеру</h3>
            <p className="text-brand-100 text-sm">
              {config.randomizerPrice} ₽ / {config.randomizerPeriod} дней
            </p>
          </div>
          <a
            href={botLink}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white text-brand-600 font-semibold py-2 px-6 rounded-lg hover:bg-brand-50 transition-colors"
          >
            Оформить подписку
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl overflow-hidden max-w-md mx-auto">
      {/* Шапка */}
      <div className="bg-gradient-to-r from-brand-500 to-brand-600 text-white p-6 text-center">
        <div className="text-4xl mb-2">🎰</div>
        <h2 className="text-2xl font-bold">Доступ к рандомайзеру</h2>
        <p className="text-brand-100 mt-2">
          Красивое объявление победителей
        </p>
      </div>

      {/* Цена */}
      <div className="p-6 text-center border-b border-gray-100">
        <div className="text-4xl font-bold text-gray-900">
          {config.randomizerPrice} <span className="text-2xl">₽</span>
        </div>
        <div className="text-gray-500 text-sm mt-1">
          за {config.randomizerPeriod} дней
        </div>
      </div>

      {/* Преимущества */}
      <div className="p-6">
        <ul className="space-y-3">
          <BenefitItem>Анимированный выбор победителей</BenefitItem>
          <BenefitItem>Эффекты конфетти и звуки</BenefitItem>
          <BenefitItem>Экспорт результатов</BenefitItem>
          <BenefitItem>Красивая страница для трансляций</BenefitItem>
          <BenefitItem>Неограниченное количество розыгрышей</BenefitItem>
        </ul>
      </div>

      {/* Кнопка */}
      <div className="p-6 pt-0">
        <a
          href={botLink}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary w-full text-center"
        >
          Оформить подписку
        </a>
        <p className="text-center text-gray-500 text-xs mt-3">
          Оплата через Telegram бота
        </p>
      </div>
    </div>
  );
}

function BenefitItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 text-gray-700">
      <span className="w-5 h-5 bg-brand-100 rounded-full flex items-center justify-center flex-shrink-0">
        <svg className="w-3 h-3 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      </span>
      {children}
    </li>
  );
}
