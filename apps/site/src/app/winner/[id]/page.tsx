'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { getRandomizerData, type RandomizerData } from '@/lib/api';

// Placeholder страница рандомайзера
// Полная анимация будет добавлена позже

export default function WinnerPage() {
  const router = useRouter();
  const params = useParams();
  const giveawayId = params.id as string;

  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<RandomizerData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showWinners, setShowWinners] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const response = await getRandomizerData(giveawayId);

        if (!response.ok || !response.data) {
          throw new Error(response.error || 'Ошибка загрузки');
        }

        setData(response.data);
      } catch (err) {
        // Ошибка авторизации — редирект на логин
        if (err instanceof Error && err.message.includes('401')) {
          router.push('/login');
          return;
        }
        // Нет доступа — редирект на dashboard
        if (err instanceof Error && err.message.includes('403')) {
          router.push('/dashboard');
          return;
        }
        setError(err instanceof Error ? err.message : 'Ошибка загрузки');
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [giveawayId, router]);

  // Запуск анимации
  const startRandomizer = () => {
    setIsAnimating(true);
    // Имитация анимации (полная анимация будет добавлена позже)
    setTimeout(() => {
      setIsAnimating(false);
      setShowWinners(true);
    }, 3000);
  };

  // Загрузка
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p>Загрузка...</p>
        </div>
      </div>
    );
  }

  // Ошибка
  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col">
        <Header isAuthenticated />
        <main className="flex-1 flex items-center justify-center px-4 pt-16">
          <div className="text-center text-white">
            <div className="text-5xl mb-4">😕</div>
            <h1 className="text-2xl font-bold mb-2">Ошибка</h1>
            <p className="text-gray-400 mb-6">{error || 'Розыгрыш не найден'}</p>
            <Link href="/dashboard" className="btn-primary">
              Вернуться
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Хедер скрыт во время анимации */}
      {!isAnimating && <Header isAuthenticated />}

      <main className="min-h-screen flex flex-col items-center justify-center px-4">
        {/* Заголовок розыгрыша */}
        {!isAnimating && !showWinners && (
          <div className="text-center max-w-2xl mx-auto animate-fade-in">
            <div className="text-6xl mb-6">🎰</div>
            <h1 className="text-3xl md:text-4xl font-bold mb-4">
              {data.giveaway.title}
            </h1>
            <p className="text-gray-400 mb-8">
              {data.giveaway.participantsCount} участников • {data.giveaway.winnersCount} победителей
            </p>
            <button
              onClick={startRandomizer}
              className="btn-primary text-lg px-12 py-4 animate-pulse-soft"
            >
              🎲 Запустить рандомайзер
            </button>
          </div>
        )}

        {/* Анимация выбора победителя */}
        {isAnimating && (
          <div className="text-center animate-pulse">
            <div className="text-8xl mb-8">🎰</div>
            <h2 className="text-3xl font-bold mb-4">Выбираем победителей...</h2>
            <div className="flex justify-center gap-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-4 h-4 bg-brand-500 rounded-full animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Результаты */}
        {showWinners && (
          <div className="text-center max-w-2xl mx-auto animate-fade-in">
            <div className="text-6xl mb-6">🎉</div>
            <h2 className="text-3xl font-bold mb-8">Победители!</h2>
            
            <div className="space-y-4 mb-8">
              {data.winners.map((winner, index) => (
                <div
                  key={winner.id}
                  className="bg-white/10 backdrop-blur-sm rounded-xl p-4 flex items-center gap-4"
                  style={{ animationDelay: `${index * 0.2}s` }}
                >
                  <div className="w-12 h-12 bg-brand-500 rounded-full flex items-center justify-center font-bold text-xl">
                    {winner.place}
                  </div>
                  <div className="text-left">
                    <p className="font-semibold">
                      {winner.user.firstName || winner.user.username || 'Аноним'}
                      {winner.user.lastName ? ` ${winner.user.lastName}` : ''}
                    </p>
                    {winner.user.username && (
                      <p className="text-gray-400 text-sm">@{winner.user.username}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => setShowWinners(false)}
                className="btn-secondary"
              >
                🔄 Повторить
              </button>
              <Link href="/dashboard" className="btn-primary">
                ← Вернуться
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
