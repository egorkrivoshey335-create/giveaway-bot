'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ConfettiOverlay } from '@/components/ui/ConfettiOverlay';
import { Mascot } from '@/components/Mascot';
import {
  getGiveawayWinners,
  getMyResult,
  WinnerInfo,
} from '@/lib/api';

export default function GiveawayResultsPage() {
  const params = useParams();
  const router = useRouter();
  const giveawayId = params.id as string;
  
  // Переводы
  const t = useTranslations('results');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Данные о розыгрыше
  const [title, setTitle] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [winners, setWinners] = useState<WinnerInfo[]>([]);
  const [totalParticipants, setTotalParticipants] = useState(0);
  const [finishedAt, setFinishedAt] = useState<string | null>(null);
  const [prizeDeliveryMethod, setPrizeDeliveryMethod] = useState<'BOT_MESSAGE' | 'FORM' | 'DESCRIPTION' | null>(null);
  const [prizeDescription, setPrizeDescription] = useState<string | null>(null);
  const [mascotType, setMascotType] = useState<string | null>(null);
  const [creatorUsername, setCreatorUsername] = useState<string | null>(null);
  
  // Мой результат
  const [myResult, setMyResult] = useState<{
    participated: boolean;
    isWinner: boolean;
    place: number | null;
  } | null>(null);

  // Анимации
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        // Загружаем победителей
        const winnersRes = await getGiveawayWinners(giveawayId);
        
        if (!winnersRes.ok) {
          setError(winnersRes.error || tErrors('loadFailed'));
          setLoading(false);
          return;
        }

        setTitle(winnersRes.title || '');
        setStatus(winnersRes.status || '');
        setWinners(winnersRes.winners || []);
        setTotalParticipants(winnersRes.totalParticipants || 0);
        setFinishedAt(winnersRes.finishedAt || null);
        setPrizeDeliveryMethod(winnersRes.prizeDeliveryMethod || null);
        setPrizeDescription(winnersRes.prizeDescription || null);
        setMascotType(winnersRes.mascotType || null);
        setCreatorUsername(winnersRes.creatorUsername || null);

        // Пробуем загрузить свой результат
        try {
          const myRes = await getMyResult(giveawayId);
          if (myRes.ok) {
            setMyResult({
              participated: myRes.participated || false,
              isWinner: myRes.isWinner || false,
              place: myRes.winner?.place || null,
            });
            
            // Если победитель - запускаем конфетти
            if (myRes.isWinner) {
              setShowConfetti(true);
            }
          }
        } catch {
          // Не авторизован — это нормально
        }

        setLoading(false);
      } catch (err) {
        console.error('Load error:', err);
        setError(tErrors('loadFailed'));
        setLoading(false);
      }
    }

    loadData();
  }, [giveawayId, tErrors]);

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
          <p className="text-tg-hint">{t('loading')}</p>
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
          <h1 className="text-xl font-bold mb-2">{tCommon('error')}</h1>
          <p className="text-tg-hint mb-6">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="bg-tg-secondary text-tg-text rounded-lg px-6 py-3"
          >
            {tCommon('goHome')}
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
          <h1 className="text-xl font-bold mb-2">{title || t('giveaway')}</h1>
          <p className="text-tg-hint mb-6">
            {t('notFinished')}
          </p>
          <button
            onClick={() => router.push(`/join/${giveawayId}`)}
            className="bg-tg-button text-tg-button-text rounded-lg px-6 py-3"
          >
            {t('participate')}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4">
      {/* Конфетти для победителей */}
      <ConfettiOverlay trigger={showConfetti} />
      
      <div className="max-w-md mx-auto">
        {/* Заголовок */}
        <div className="text-center mb-6">
          <div className="text-5xl mb-3">🏆</div>
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="text-tg-hint mt-1">{t('subtitle')}</p>
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
                {/* Радостный маскот для победителя */}
                {mascotType && (
                  <div className="mb-4 flex justify-center">
                    <Mascot 
                      type={mascotType as any} 
                      size={100}
                      className="mx-auto"
                    />
                  </div>
                )}
                
                <div className="text-4xl mb-2">🎉</div>
                <h2 className="text-lg font-bold text-yellow-500">{t('myResult.congratulations')}</h2>
                <p className="text-sm mt-1">
                  {t('myResult.place', { place: myResult.place ?? 1 })}
                </p>
                
                {/* Информация о получении приза */}
                {prizeDeliveryMethod && (
                  <div className="mt-4 p-3 bg-tg-bg rounded-lg border border-yellow-500/20 text-left">
                    <div className="flex items-start gap-2 mb-2">
                      <span className="text-xl">🎁</span>
                      <h3 className="font-semibold text-sm">{t('myResult.prizeInfo')}</h3>
                    </div>
                    
                    {prizeDeliveryMethod === 'BOT_MESSAGE' && (
                      <p className="text-xs text-tg-hint">
                        {t('myResult.prizeMethodBot')}
                      </p>
                    )}
                    
                    {prizeDeliveryMethod === 'FORM' && (
                      <div className="space-y-2">
                        <p className="text-xs text-tg-hint mb-2">
                          {t('myResult.prizeMethodForm')}
                        </p>
                        <button
                          onClick={() => {
                            // TODO: открыть форму получения приза (Block 14)
                            alert('Форма получения приза будет реализована в Block 14');
                          }}
                          className="w-full bg-yellow-500 text-black text-sm rounded-lg py-2 font-medium hover:opacity-90"
                        >
                          {t('myResult.fillForm')}
                        </button>
                      </div>
                    )}
                    
                    {prizeDeliveryMethod === 'DESCRIPTION' && prizeDescription && (
                      <div className="text-xs text-tg-hint whitespace-pre-wrap">
                        {prizeDescription}
                      </div>
                    )}
                  </div>
                )}
                
                {/* Кнопки для победителя */}
                <div className="mt-4 space-y-2">
                  {/* Кнопка "Поделиться победой" */}
                  <button
                    onClick={() => {
                      const shareText = `🎉 Я выиграл в розыгрыше "${title}"! Участвуйте и вы!`;
                      const shareUrl = `https://t.me/share/url?url=https://t.me/BeastRandomBot/participate?startapp=join_${giveawayId}&text=${encodeURIComponent(shareText)}`;
                      
                      if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
                        (window as any).Telegram.WebApp.openTelegramLink(shareUrl);
                      } else {
                        window.open(shareUrl, '_blank');
                      }
                    }}
                    className="w-full bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg py-2.5 text-sm font-medium flex items-center justify-center gap-2"
                  >
                    <span>🎉</span>
                    <span>{t('myResult.shareVictory')}</span>
                  </button>
                  
                  {/* Кнопка "Связаться с организатором" */}
                  {creatorUsername && (
                    <button
                      onClick={() => {
                        const link = `https://t.me/${creatorUsername.replace('@', '')}`;
                        if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
                          (window as any).Telegram.WebApp.openTelegramLink(link);
                        } else {
                          window.open(link, '_blank');
                        }
                      }}
                      className="w-full bg-tg-button text-tg-button-text rounded-lg py-2.5 text-sm font-medium flex items-center justify-center gap-2"
                    >
                      <span>💬</span>
                      <span>{t('myResult.contactCreator')}</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center">
                {/* Грустный маскот для проигравшего */}
                {mascotType && (
                  <div className="mb-4 flex justify-center">
                    <Mascot 
                      type={mascotType as any} 
                      size={80}
                      className="mx-auto opacity-70"
                    />
                  </div>
                )}
                
                <p className="text-tg-hint">{t('myResult.notWinner')}</p>
                <p className="text-sm text-tg-hint mt-1">{t('myResult.goodLuck')} 🍀</p>
                
                {/* Кнопка "Другие розыгрыши" для проигравших */}
                <button
                  onClick={() => router.push('/catalog')}
                  className="mt-4 w-full bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-lg py-2.5 text-sm font-medium"
                >
                  🎁 {t('myResult.moreCatalog')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Статистика */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-tg-secondary rounded-lg p-3 text-center">
            <div className="text-2xl font-bold">{totalParticipants}</div>
            <div className="text-xs text-tg-hint">{t('participants')}</div>
          </div>
          <div className="bg-tg-secondary rounded-lg p-3 text-center">
            <div className="text-2xl font-bold">{winners.length}</div>
            <div className="text-xs text-tg-hint">{t('winnersCount')}</div>
          </div>
        </div>

        {/* Список победителей */}
        <div className="bg-tg-secondary rounded-xl p-4 mb-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <span>🏆</span>
            <span>{t('winners')}</span>
          </h2>
          
          {winners.length === 0 ? (
            <p className="text-tg-hint text-center py-4">{t('noWinners')}</p>
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
            {t('finishedAt')}: {new Date(finishedAt).toLocaleString()}
          </p>
        )}

        {/* Кнопки */}
        <div className="space-y-3">
          <button
            onClick={() => router.push('/')}
            className="w-full bg-tg-secondary text-tg-text rounded-lg py-3"
          >
            {tCommon('goHome')}
          </button>
        </div>
      </div>
    </main>
  );
}
