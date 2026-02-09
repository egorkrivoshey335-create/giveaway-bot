'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { PaywallBanner } from '@/components/PaywallBanner';
import { getMe, getGiveaways, type GiveawayListItem, type User } from '@/lib/api';
import { config } from '@/lib/config';

export default function DashboardPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [giveaways, setGiveaways] = useState<GiveawayListItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        // Получаем данные пользователя
        const meResponse = await getMe();

        if (!meResponse.ok || !meResponse.user) {
          // Не авторизован — редирект на логин
          router.push('/login');
          return;
        }

        setUser(meResponse.user);
        setHasAccess(meResponse.hasRandomizerAccess || false);

        // Получаем список розыгрышей
        const giveawaysResponse = await getGiveaways();

        if (giveawaysResponse.ok && giveawaysResponse.giveaways) {
          setGiveaways(giveawaysResponse.giveaways);
        }
      } catch (err) {
        // Ошибка авторизации — редирект на логин
        if (err instanceof Error && err.message.includes('401')) {
          router.push('/login');
          return;
        }
        setError(err instanceof Error ? err.message : 'Ошибка загрузки');
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [router]);

  // Загрузка
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Загрузка...</p>
        </div>
      </div>
    );
  }

  // Ошибка
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white flex flex-col">
        <Header isAuthenticated />
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="text-center">
            <div className="text-5xl mb-4">😕</div>
            <h1 className="text-2xl font-bold mb-2">Ошибка</h1>
            <p className="text-gray-600 mb-6">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="btn-primary"
            >
              Попробовать снова
            </button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white flex flex-col">
      <Header isAuthenticated />

      <main className="flex-1 pt-24 pb-12 px-4">
        <div className="container mx-auto max-w-4xl">
          {/* Приветствие */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">
              Привет, {user?.firstName || user?.username || 'друг'}! 👋
            </h1>
            <p className="text-gray-600">
              Здесь вы можете запустить рандомайзер для ваших завершённых розыгрышей
            </p>
          </div>

          {/* Paywall Banner если нет доступа */}
          {!hasAccess && (
            <div className="mb-8">
              <PaywallBanner variant="compact" />
            </div>
          )}

          {/* Список розыгрышей */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-6">Завершённые розыгрыши</h2>

            {giveaways.length === 0 ? (
              // Пустое состояние
              <div className="text-center py-12">
                <div className="text-5xl mb-4">🎁</div>
                <h3 className="text-lg font-semibold mb-2">Розыгрышей пока нет</h3>
                <p className="text-gray-600 mb-6">
                  Создайте свой первый розыгрыш в боте
                </p>
                <a
                  href={`https://t.me/${config.botUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary"
                >
                  Создать розыгрыш
                </a>
              </div>
            ) : (
              // Список розыгрышей
              <div className="space-y-4">
                {giveaways.map((giveaway) => (
                  <GiveawayCard
                    key={giveaway.id}
                    giveaway={giveaway}
                    hasAccess={hasAccess}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

// Компонент карточки розыгрыша
function GiveawayCard({
  giveaway,
  hasAccess,
}: {
  giveaway: GiveawayListItem;
  hasAccess: boolean;
}) {
  const formattedDate = new Date(giveaway.finishedAt).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const isRandomizerMode = giveaway.publishResultsMode === 'RANDOMIZER';
  const isPublished = giveaway.winnersPublished;

  return (
    <div className="border border-gray-200 rounded-xl p-4 hover:border-brand-300 transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-lg">{giveaway.title}</h3>
            {/* Бейдж статуса */}
            {isPublished && (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full bg-green-100 text-green-700">
                ✅ Победители объявлены
              </span>
            )}
            {isRandomizerMode && !isPublished && (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                🎲 Ожидает объявления
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-gray-600">
            <span className="flex items-center gap-1">
              <span>👥</span>
              {giveaway.participantsCount} участников
            </span>
            <span className="flex items-center gap-1">
              <span>🏆</span>
              {giveaway.winnersCount} победителей
            </span>
            <span className="flex items-center gap-1">
              <span>📅</span>
              {formattedDate}
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          {hasAccess ? (
            <>
              <Link
                href={`/winner/${giveaway.id}`}
                className="btn-primary text-sm py-2 px-4 whitespace-nowrap"
              >
                🎰 Запустить рандомайзер
              </Link>
              {/* Кнопка результатов — показываем для всех завершённых розыгрышей с победителями */}
              {giveaway.winnersCount > 0 && (
                <Link
                  href={`/results/${giveaway.id}`}
                  className="btn-secondary text-sm py-2 px-4 whitespace-nowrap"
                >
                  📋 Результаты
                </Link>
              )}
            </>
          ) : (
            <span className="text-gray-400 text-sm flex items-center gap-1">
              <span>🔒</span>
              Требуется подписка
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
