'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getGiveawayWinners,
  getMyResult,
  WinnerInfo,
} from '@/lib/api';

export default function GiveawayResultsPage() {
  const params = useParams();
  const router = useRouter();
  const giveawayId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Данные о розыгрыше
  const [title, setTitle] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [winners, setWinners] = useState<WinnerInfo[]>([]);
  const [totalParticipants, setTotalParticipants] = useState(0);
  const [finishedAt, setFinishedAt] = useState<string | null>(null);
  
  // Мой результат
  const [myResult, setMyResult] = useState<{
    participated: boolean;
    isWinner: boolean;
    place: number | null;
  } | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        // Загружаем победителей
        const winnersRes = await getGiveawayWinners(giveawayId);
        
        if (!winnersRes.ok) {
          setError(winnersRes.error || 'Ошибка загрузки');
          setLoading(false);
          return;
        }

        setTitle(winnersRes.title || '');
        setStatus(winnersRes.status || '');
        setWinners(winnersRes.winners || []);
        setTotalParticipants(winnersRes.totalParticipants || 0);
        setFinishedAt(winnersRes.finishedAt || null);

        // Пробуем загрузить свой результат
        try {
          const myRes = await getMyResult(giveawayId);
          if (myRes.ok) {
            setMyResult({
              participated: myRes.participated || false,
              isWinner: myRes.isWinner || false,
              place: myRes.winner?.place || null,
            });
          }
        } catch {
          // Не авторизован — это нормально
        }

        setLoading(false);
      } catch (err) {
        console.error('Load error:', err);
        setError('Ошибка загрузки');
        setLoading(false);
      }
    }

    loadData();
  }, [giveawayId]);

  // Форматирование имени пользователя
  const formatUserName = (user: WinnerInfo['user']): string => {
    if (user.firstName) {
      return user.lastName 
        ? `${user.firstName} ${user.lastName}`
        : user.firstName;
    }
    if (user.username) {
      return `@${user.username}`;
    }
    return `User ${user.telegramUserId.slice(-4)}`;
  };

  // Загрузка
  if (loading) {
    return (
      <main className="min-h-screen p-4 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-3 border-tg-button border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-tg-hint">Загрузка результатов...</p>
        </div>
      </main>
    );
  }

  // Ошибка
  if (error) {
    return (
      <main className="min-h-screen p-4 flex items-center justify-center">
        <div className="max-w-md w-full text-center">
          <div className="text-6xl mb-4">❌</div>
          <h1 className="text-xl font-bold mb-2">Ошибка</h1>
          <p className="text-tg-hint mb-6">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="bg-tg-secondary text-tg-text rounded-lg px-6 py-3"
          >
            На главную
          </button>
        </div>
      </main>
    );
  }

  // Розыгрыш ещё не завершён
  if (status !== 'FINISHED') {
    return (
      <main className="min-h-screen p-4 flex items-center justify-center">
        <div className="max-w-md w-full text-center">
          <div className="text-6xl mb-4">⏳</div>
          <h1 className="text-xl font-bold mb-2">{title || 'Розыгрыш'}</h1>
          <p className="text-tg-hint mb-6">
            Розыгрыш ещё не завершён. Победители будут объявлены после окончания.
          </p>
          <button
            onClick={() => router.push(`/join/${giveawayId}`)}
            className="bg-tg-button text-tg-button-text rounded-lg px-6 py-3"
          >
            Участвовать
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4">
      <div className="max-w-md mx-auto">
        {/* Заголовок */}
        <div className="text-center mb-6">
          <div className="text-5xl mb-3">🏆</div>
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="text-tg-hint mt-1">Результаты розыгрыша</p>
        </div>

        {/* Мой результат */}
        {myResult && myResult.participated && (
          <div className={`rounded-xl p-4 mb-6 ${
            myResult.isWinner 
              ? 'bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/30' 
              : 'bg-tg-secondary'
          }`}>
            {myResult.isWinner ? (
              <div className="text-center">
                <div className="text-4xl mb-2">🎉</div>
                <h2 className="text-lg font-bold text-yellow-500">Поздравляем!</h2>
                <p className="text-sm mt-1">
                  Вы заняли <span className="font-bold">{myResult.place} место</span>!
                </p>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-tg-hint">Вы участвовали, но не выиграли в этот раз.</p>
                <p className="text-sm text-tg-hint mt-1">Удачи в следующих розыгрышах! 🍀</p>
              </div>
            )}
          </div>
        )}

        {/* Статистика */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-tg-secondary rounded-lg p-3 text-center">
            <div className="text-2xl font-bold">{totalParticipants}</div>
            <div className="text-xs text-tg-hint">участников</div>
          </div>
          <div className="bg-tg-secondary rounded-lg p-3 text-center">
            <div className="text-2xl font-bold">{winners.length}</div>
            <div className="text-xs text-tg-hint">победителей</div>
          </div>
        </div>

        {/* Список победителей */}
        <div className="bg-tg-secondary rounded-xl p-4 mb-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <span>🏆</span>
            <span>Победители</span>
          </h2>
          
          {winners.length === 0 ? (
            <p className="text-tg-hint text-center py-4">Победителей нет</p>
          ) : (
            <div className="space-y-3">
              {winners.map((winner) => (
                <div
                  key={winner.place}
                  className={`flex items-center gap-3 p-3 rounded-lg ${
                    winner.place === 1 
                      ? 'bg-yellow-500/10' 
                      : winner.place === 2 
                        ? 'bg-gray-400/10' 
                        : winner.place === 3 
                          ? 'bg-orange-600/10' 
                          : 'bg-tg-bg'
                  }`}
                >
                  {/* Место */}
                  <div className="text-2xl">
                    {winner.place === 1 && '🥇'}
                    {winner.place === 2 && '🥈'}
                    {winner.place === 3 && '🥉'}
                    {winner.place > 3 && (
                      <span className="text-lg font-bold text-tg-hint">
                        #{winner.place}
                      </span>
                    )}
                  </div>
                  
                  {/* Пользователь */}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {formatUserName(winner.user)}
                    </div>
                    {winner.user.username && winner.user.firstName && (
                      <div className="text-xs text-tg-hint">
                        @{winner.user.username}
                      </div>
                    )}
                  </div>
                  
                  {/* Билеты */}
                  <div className="text-right">
                    <div className="text-sm text-tg-hint">
                      🎫 {winner.ticketsUsed}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Дата завершения */}
        {finishedAt && (
          <p className="text-center text-xs text-tg-hint mb-6">
            Завершён: {new Date(finishedAt).toLocaleString('ru-RU')}
          </p>
        )}

        {/* Кнопки */}
        <div className="space-y-3">
          <button
            onClick={() => router.push('/')}
            className="w-full bg-tg-secondary text-tg-text rounded-lg py-3"
          >
            На главную
          </button>
        </div>
      </div>
    </main>
  );
}
