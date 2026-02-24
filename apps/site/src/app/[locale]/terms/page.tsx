import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

interface Props {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'terms' });
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://randombeast.ru';

  return {
    title: t('title'),
    alternates: {
      canonical: `${baseUrl}/${locale === 'ru' ? '' : `${locale}/`}terms`,
    },
  };
}

const LAST_UPDATED = '2024-02-01';

export default async function TermsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'terms' });

  const sections = [
    'service',
    'rules',
    'prizes',
    'subscriptions',
    'prohibited',
    'blocking',
    'liability',
    'changes',
    'contact',
  ] as const;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />

      <main className="flex-1 pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-3xl">
          {/* Заголовок */}
          <div className="mb-10">
            <h1 className="text-4xl font-bold text-gray-900 mb-3">{t('title')}</h1>
            <p className="text-sm text-gray-500">
              {t('lastUpdated')}: {new Date(LAST_UPDATED).toLocaleDateString(
                locale === 'ru' ? 'ru-RU' : locale === 'kk' ? 'kk-KZ' : 'en-US',
                { year: 'numeric', month: 'long', day: 'numeric' }
              )}
            </p>
          </div>

          {/* Введение */}
          <div className="bg-brand-50 border border-brand-200 rounded-xl p-6 mb-8">
            <p className="text-gray-700 leading-relaxed">{t('intro')}</p>
          </div>

          {/* Разделы */}
          <div className="space-y-6">
            {sections.map((section, index) => (
              <section
                key={section}
                className="bg-white rounded-xl p-6 shadow-sm border border-gray-100"
              >
                <h2 className="text-xl font-semibold text-gray-900 mb-3 flex items-center gap-3">
                  <span className="flex-shrink-0 w-8 h-8 bg-brand-100 text-brand-600 rounded-full flex items-center justify-center text-sm font-bold">
                    {index + 1}
                  </span>
                  {t(`sections.${section}.title`)}
                </h2>
                <p className="text-gray-600 leading-relaxed">
                  {t(`sections.${section}.content`)}
                </p>
              </section>
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
