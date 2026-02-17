import { useTranslations } from 'next-intl';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { FeatureCard } from '@/components/FeatureCard';
import { SmartLink } from '@/components/SmartLink';
import { config } from '@/lib/config';

export default function HomePage() {
  const t = useTranslations('landing');
  const tCommon = useTranslations('common');

  const botLink = `https://t.me/${config.botUsername}`;

  const features = [
    {
      emoji: '🎁',
      title: t('features.createGiveaways.title'),
      description: t('features.createGiveaways.description'),
    },
    {
      emoji: '✅',
      title: t('features.checkSubscription.title'),
      description: t('features.checkSubscription.description'),
    },
    {
      emoji: '🛡️',
      title: t('features.botProtection.title'),
      description: t('features.botProtection.description'),
    },
    {
      emoji: '🎲',
      title: t('features.extraChances.title'),
      description: t('features.extraChances.description'),
    },
    {
      emoji: '🎰',
      title: t('features.beautifulRandomizer.title'),
      description: t('features.beautifulRandomizer.description'),
    },
    {
      emoji: '📊',
      title: t('features.statistics.title'),
      description: t('features.statistics.description'),
    },
  ];

  const steps = [
    {
      number: 1,
      emoji: '📝',
      title: t('howItWorks.step1.title'),
      description: t('howItWorks.step1.description'),
    },
    {
      number: 2,
      emoji: '📢',
      title: t('howItWorks.step2.title'),
      description: t('howItWorks.step2.description'),
    },
    {
      number: 3,
      emoji: '👥',
      title: t('howItWorks.step3.title'),
      description: t('howItWorks.step3.description'),
    },
    {
      number: 4,
      emoji: '🏆',
      title: t('howItWorks.step4.title'),
      description: t('howItWorks.step4.description'),
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white">
      <Header />

      {/* Hero секция */}
      <section className="pt-32 pb-20 px-4">
        <div className="container mx-auto text-center max-w-4xl">
          <h1 className="text-5xl md:text-6xl font-bold mb-6 animate-fade-in">
            <span className="text-gradient">{t('hero.title')}</span>
          </h1>
          <p className="text-xl md:text-2xl text-gray-600 mb-10 animate-slide-up">
            {t('hero.subtitle')}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up">
            <a
              href={botLink}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary"
            >
              <span className="text-xl">🤖</span>
              {t('hero.openBot')}
            </a>
            <SmartLink className="btn-secondary">
              <span className="text-xl">🎰</span>
              {t('hero.randomizer')}
            </SmartLink>
          </div>
        </div>
      </section>

      {/* Features секция */}
      <section className="py-20 px-4 bg-white">
        <div className="container mx-auto max-w-6xl">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
            {t('features.title')}
          </h2>
          <p className="text-gray-600 text-center mb-12 max-w-2xl mx-auto">
            {t('features.subtitle')}
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <FeatureCard
                key={feature.title}
                emoji={feature.emoji}
                title={feature.title}
                description={feature.description}
              />
            ))}
          </div>
        </div>
      </section>

      {/* How it works секция */}
      <section className="py-20 px-4 bg-gradient-to-b from-white to-brand-50">
        <div className="container mx-auto max-w-4xl">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
            {t('howItWorks.title')}
          </h2>
          <p className="text-gray-600 text-center mb-12">
            {t('howItWorks.subtitle')}
          </p>
          <div className="grid md:grid-cols-4 gap-8">
            {steps.map((step) => (
              <div key={step.number} className="text-center">
                <div className="relative mb-4">
                  <div className="w-20 h-20 bg-brand-100 rounded-full flex items-center justify-center mx-auto">
                    <span className="text-4xl">{step.emoji}</span>
                  </div>
                  <div className="absolute -top-2 -right-2 w-8 h-8 bg-brand-500 text-white rounded-full flex items-center justify-center font-bold text-sm">
                    {step.number}
                  </div>
                </div>
                <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                <p className="text-gray-600 text-sm">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Randomizer Promo секция */}
      <section className="py-20 px-4 bg-white">
        <div className="container mx-auto max-w-4xl">
          <div className="bg-gradient-to-r from-brand-500 to-brand-600 rounded-3xl p-8 md:p-12 text-white text-center">
            <div className="text-5xl mb-6">🎰</div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {t('randomizerPromo.title')}
            </h2>
            <p className="text-xl text-brand-100 mb-8 max-w-2xl mx-auto">
              {t('randomizerPromo.description')}
            </p>
            <SmartLink
              className="inline-flex items-center gap-2 bg-white text-brand-600 font-semibold py-3 px-8 rounded-xl hover:bg-brand-50 transition-colors"
            >
              <span className="text-xl">✨</span>
              {t('randomizerPromo.tryIt')}
            </SmartLink>
          </div>
        </div>
      </section>

      {/* CTA секция */}
      <section className="py-20 px-4 bg-brand-50">
        <div className="container mx-auto max-w-2xl text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            {t('cta.title')}
          </h2>
          <p className="text-gray-600 mb-8">{t('cta.description')}</p>
          <a
            href={botLink}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary text-lg"
          >
            <span className="text-2xl">🚀</span>
            {t('cta.startBot')}
          </a>
        </div>
      </section>

      <Footer />
    </div>
  );
}
