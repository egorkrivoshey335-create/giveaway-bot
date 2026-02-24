'use client';

import { useTranslations } from 'next-intl';
import { config } from '@/lib/config';

interface PlanFeature {
  text: string;
}

interface PlanCardProps {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  cta: string;
  badge?: string;
  highlight?: boolean;
  botLink: string;
}

function PlanCard({
  name,
  price,
  period,
  description,
  features,
  cta,
  badge,
  highlight = false,
  botLink,
}: PlanCardProps) {
  return (
    <div
      className={`relative flex flex-col rounded-2xl p-8 transition-all duration-300 hover:-translate-y-1 ${
        highlight
          ? 'bg-brand-500 text-white shadow-2xl shadow-brand-200 ring-2 ring-brand-400'
          : 'bg-white text-gray-900 shadow-lg border border-gray-100 hover:shadow-xl'
      }`}
    >
      {/* Бейдж */}
      {badge && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
          <span className="bg-gradient-to-r from-orange-400 to-pink-500 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-md">
            {badge}
          </span>
        </div>
      )}

      {/* Название и цена */}
      <div className="mb-6">
        <div
          className={`inline-block text-xs font-bold tracking-widest uppercase px-3 py-1 rounded-full mb-4 ${
            highlight ? 'bg-white/20 text-white' : 'bg-brand-100 text-brand-600'
          }`}
        >
          {name}
        </div>
        <div className="flex items-baseline gap-1">
          <span className={`text-4xl font-black ${highlight ? 'text-white' : 'text-gray-900'}`}>
            {price}
          </span>
          {period && (
            <span className={`text-sm ${highlight ? 'text-brand-100' : 'text-gray-500'}`}>
              / {period}
            </span>
          )}
        </div>
        <p className={`mt-2 text-sm ${highlight ? 'text-brand-100' : 'text-gray-500'}`}>
          {description}
        </p>
      </div>

      {/* Фичи */}
      <ul className="space-y-3 mb-8 flex-1">
        {features.map((feature, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm">
            <svg
              className={`w-5 h-5 flex-shrink-0 mt-0.5 ${highlight ? 'text-white' : 'text-brand-500'}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span className={highlight ? 'text-brand-50' : 'text-gray-600'}>{feature}</span>
          </li>
        ))}
      </ul>

      {/* CTA */}
      <a
        href={botLink}
        target="_blank"
        rel="noopener noreferrer"
        className={`block w-full text-center py-3.5 px-6 rounded-xl font-semibold text-sm transition-all duration-200 ${
          highlight
            ? 'bg-white text-brand-600 hover:bg-brand-50 shadow-lg'
            : 'bg-brand-500 text-white hover:bg-brand-600 shadow-md hover:shadow-lg'
        }`}
      >
        {cta}
      </a>
    </div>
  );
}

export function PricingSection() {
  const t = useTranslations('pricing');
  const botLink = `https://t.me/${config.botUsername}`;

  return (
    <section id="pricing" className="py-20 px-4 bg-gradient-to-b from-white to-brand-50">
      <div className="container mx-auto max-w-6xl">
        {/* Заголовок */}
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">{t('title')}</h2>
          <p className="text-gray-600 max-w-xl mx-auto">{t('subtitle')}</p>
        </div>

        {/* Карточки планов */}
        <div className="grid md:grid-cols-3 gap-8 items-start mt-8">
          {/* FREE */}
          <PlanCard
            name={t('free.name')}
            price={t('free.price')}
            period={t('free.period')}
            description={t('free.description')}
            features={[
              t('free.features.0'),
              t('free.features.1'),
              t('free.features.2'),
              t('free.features.3'),
            ]}
            cta={t('free.cta')}
            botLink={botLink}
          />

          {/* PLUS — выделенный */}
          <PlanCard
            name={t('plus.name')}
            price={t('plus.price')}
            period={t('plus.period')}
            description={t('plus.description')}
            features={[
              t('plus.features.0'),
              t('plus.features.1'),
              t('plus.features.2'),
              t('plus.features.3'),
              t('plus.features.4'),
              t('plus.features.5'),
            ]}
            cta={t('plus.cta')}
            badge={t('plus.badge')}
            highlight
            botLink={botLink}
          />

          {/* PRO */}
          <PlanCard
            name={t('pro.name')}
            price={t('pro.price')}
            period={t('pro.period')}
            description={t('pro.description')}
            features={[
              t('pro.features.0'),
              t('pro.features.1'),
              t('pro.features.2'),
              t('pro.features.3'),
              t('pro.features.4'),
              t('pro.features.5'),
              t('pro.features.6'),
            ]}
            cta={t('pro.cta')}
            botLink={botLink}
          />
        </div>

        {/* Подпись */}
        <p className="text-center text-sm text-gray-500 mt-8">
          {t('openBot')} —{' '}
          <a
            href={botLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-500 hover:text-brand-600 font-medium"
          >
            @{config.botUsername}
          </a>
        </p>
      </div>
    </section>
  );
}
