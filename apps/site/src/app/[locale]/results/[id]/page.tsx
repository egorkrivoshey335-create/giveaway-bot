import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { config } from '@/lib/config';
import { getMedal, getPlaceColor, isLightBackground } from '@/lib/helpers';

// Публичная страница результатов розыгрыша
// Данные загружаются с API без авторизации
// Применяется кастомизация (цвета, логотип) если она была сохранена

interface ResultsPageProps {
  params: Promise<{ id: string }>;
}

interface Winner {
  place: number;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
}

interface Prize {
  place: number;
  title: string;
  description?: string;
}

interface Customization {
  backgroundColor: string;
  accentColor: string;
  logoUrl?: string | null;
}

interface GiveawayResult {
  id: string;
  title: string;
  winnersCount: number;
  participantsCount: number;
  finishedAt: string;
}

interface ApiResponse {
  ok: boolean;
  giveaway?: GiveawayResult;
  winners?: Winner[];
  prizes?: Prize[];
  customization?: Customization;
  error?: string;
}

async function getResults(id: string): Promise<ApiResponse | null> {
  try {
    const response = await fetch(`${config.apiUrl}/site/giveaways/${id}/results`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch {
    return null;
  }
}

export default async function ResultsPage({ params }: ResultsPageProps) {
  const { id } = await params;
  const t = await getTranslations('results');
  const tCommon = await getTranslations('common');
  const tLanding = await getTranslations('landing');
  const data = await getResults(id);

  if (!data || !data.ok || !data.giveaway) {
    notFound();
  }

  const { giveaway, winners = [], prizes = [], customization } = data;

  // Дефолтные цвета если кастомизация не задана
  const backgroundColor = customization?.backgroundColor || '#0f0f23';
  const accentColor = customization?.accentColor || '#f2b6b6';
  const logoUrl = customization?.logoUrl;

  // Цвета текста в зависимости от фона
  const isLight = isLightBackground(backgroundColor);
  const textColor = isLight ? '#1f2937' : '#ffffff';
  const textSecondary = isLight ? '#6b7280' : '#9ca3af';

  const formattedDate = new Date(giveaway.finishedAt).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Функция для форматирования имени
  const formatName = (winner: Winner): string => {
    const fullName = `${winner.firstName || ''} ${winner.lastName || ''}`.trim();
    return fullName || (winner.username ? `@${winner.username}` : 'Аноним');
  };

  return (
    <div
      className="min-h-screen flex flex-col transition-colors"
      style={{ backgroundColor }}
    >
      {/* Хедер */}
      <Header darkMode={!isLight} />

      <main className="flex-1 pt-24 pb-12 px-4">
        <div className="container mx-auto max-w-2xl">
          {/* Логотип */}
          {logoUrl && (
            <div className="text-center mb-6">
              <Image
                src={logoUrl}
                alt="Logo"
                width={160}
                height={64}
                className="h-16 w-auto object-contain mx-auto"
                unoptimized
              />
            </div>
          )}

          {/* Карточка результатов */}
          <div
            className="rounded-2xl overflow-hidden shadow-2xl"
            style={{ backgroundColor: isLight ? '#ffffff' : 'rgba(255,255,255,0.1)' }}
          >
            {/* Шапка */}
            <div
              className="p-6 text-center"
              style={{ backgroundColor: accentColor }}
            >
              <div className="text-4xl mb-2">🏆</div>
              <h1
                className="text-2xl font-bold"
                style={{ color: isLightBackground(accentColor) ? '#1f2937' : '#ffffff' }}
              >
                {t('title')}
              </h1>
            </div>

            {/* Информация о розыгрыше */}
            <div
              className="p-6 border-b"
              style={{ borderColor: isLight ? '#e5e7eb' : 'rgba(255,255,255,0.1)' }}
            >
              <h2 className="text-xl font-semibold mb-2" style={{ color: textColor }}>
                {giveaway.title}
              </h2>
              <div className="flex flex-wrap items-center gap-4 text-sm" style={{ color: textSecondary }}>
                <span className="flex items-center gap-1">
                  <span>👥</span>
                  {giveaway.participantsCount} {tCommon('participants')}
                </span>
                <span className="flex items-center gap-1">
                  <span>🏆</span>
                  {giveaway.winnersCount} {tCommon('winners')}
                </span>
                <span className="flex items-center gap-1">
                  <span>📅</span>
                  {formattedDate}
                </span>
              </div>
            </div>

            {/* Список победителей */}
            <div className="p-6">
              <h3 className="font-semibold mb-4" style={{ color: textColor }}>
                {t('winnersTitle')}
              </h3>
              <div className="space-y-3">
                {winners.map((winner) => {
                  const prize = prizes.find(p => p.place === winner.place);
                  return (
                    <div
                      key={winner.place}
                      className="flex items-center gap-4 p-4 rounded-xl"
                      style={{
                        backgroundColor: isLight ? '#f9fafb' : 'rgba(255,255,255,0.05)',
                        borderLeft: `4px solid ${getPlaceColor(winner.place)}`,
                      }}
                    >
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-xl text-white shrink-0"
                        style={{ backgroundColor: getPlaceColor(winner.place) }}
                      >
                        {getMedal(winner.place)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate" style={{ color: textColor }}>
                          {formatName(winner)}
                        </p>
                        {winner.username && (
                          <p className="text-sm truncate" style={{ color: textSecondary }}>
                            @{winner.username}
                          </p>
                        )}
                      </div>
                      {prize?.title && (
                        <span
                          className="px-3 py-1 rounded-full text-sm shrink-0"
                          style={{
                            backgroundColor: isLight ? '#f3f4f6' : 'rgba(255,255,255,0.1)',
                            color: textColor,
                          }}
                        >
                          🎁 {prize.title}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Ссылка на бота */}
            <div
              className="p-6 text-center"
              style={{ backgroundColor: isLight ? '#f9fafb' : 'rgba(255,255,255,0.05)' }}
            >
              <p className="text-sm mb-3" style={{ color: textSecondary }}>
                {tLanding('cta.description')}
              </p>
              <a
                href={`https://t.me/${config.botUsername}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold transition-transform hover:scale-105"
                style={{
                  backgroundColor: accentColor,
                  color: isLightBackground(accentColor) ? '#1f2937' : '#ffffff',
                }}
              >
                🤖 {tLanding('hero.openBot')}
              </a>
            </div>
          </div>

          {/* Кнопка назад */}
          <div className="text-center mt-6">
            <Link
              href="/"
              className="text-sm transition-colors hover:underline"
              style={{ color: textSecondary }}
            >
              ← {t('goHome')}
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
