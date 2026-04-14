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
import { AppIcon } from '@/components/AppIcon';
import { motion, AnimatePresence } from 'framer-motion';

export default function GiveawayResultsPage() {
  const params = useParams();
  const router = useRouter();
  const giveawayId = params.id as string;
  
  const t = useTranslations('results');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [title, setTitle] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [winners, setWinners] = useState<WinnerInfo[]>([]);
  const [totalParticipants, setTotalParticipants] = useState(0);
  const [finishedAt, setFinishedAt] = useState<string | null>(null);
  const [prizeDeliveryMethod, setPrizeDeliveryMethod] = useState<'BOT_MESSAGE' | 'FORM' | 'DESCRIPTION' | null>(null);
  const [prizeDescription, setPrizeDescription] = useState<string | null>(null);
  const [creatorUsername, setCreatorUsername] = useState<string | null>(null);
  
  const [myResult, setMyResult] = useState<{
    participated: boolean;
    isWinner: boolean;
    place: number | null;
  } | null>(null);

  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
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
        setCreatorUsername(winnersRes.creatorUsername || null);

        try {
          const myRes = await getMyResult(giveawayId);
          if (myRes.ok) {
            setMyResult({
              participated: myRes.participated || false,
              isWinner: myRes.isWinner || false,
              place: myRes.winner?.place || null,
            });
            
            if (myRes.isWinner) {
              setShowConfetti(true);
            }
          }
        } catch {
          // Not authorized
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

  if (loading) {
    return (
      <main className="min-h-screen p-4 flex items-center justify-center">
        <div className="text-center">
          <Mascot type="state-loading" size={120} loop autoplay />
          <p className="text-tg-hint mt-2">{t('loading')}</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen p-4 flex items-center justify-center">
        <div className="max-w-md w-full text-center">
          <Mascot type="state-error" size={140} loop autoplay className="mx-auto mb-4" />
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

  if (status !== 'FINISHED') {
    return (
      <main className="min-h-screen p-4 flex items-center justify-center">
        <div className="max-w-md w-full text-center">
          <Mascot type="state-loading" size={140} loop autoplay className="mx-auto mb-4" />
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

  const isWinner = myResult?.isWinner ?? false;
  const isParticipant = myResult?.participated ?? false;

  const placeColors = [
    'from-yellow-400 to-amber-500 text-white shadow-amber-500/30',
    'from-slate-300 to-slate-400 text-white shadow-slate-400/30',
    'from-amber-600 to-amber-700 text-white shadow-amber-700/30',
  ];

  return (
    <main className="min-h-screen p-4 pb-8">
      <ConfettiOverlay trigger={showConfetti} />
      
      <AnimatePresence mode="wait">
        <motion.div
          key="results"
          className="max-w-md mx-auto"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          {/* Hero Lottie */}
          <div className="flex justify-center mb-2">
            <Mascot 
              type={isWinner ? 'participant-joined' : (isParticipant ? 'participant-lost' : 'participant-joined')} 
              size={180} 
              loop 
              autoplay 
            />
          </div>

          {/* Title block with dashed border */}
          <div className="text-center mb-6">
            <div className="border-2 border-dashed border-tg-hint/30 rounded-2xl p-4 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-tg-bg px-3">
                <span className="text-xs font-medium text-tg-hint uppercase tracking-wider">{t('subtitle')}</span>
              </div>
              <h1 className="text-xl font-bold mt-1">{title}</h1>
              {finishedAt && (
                <p className="text-xs text-tg-hint mt-2">
                  {t('finishedAt')}: {new Date(finishedAt).toLocaleString()}
                </p>
              )}
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-tg-secondary rounded-xl p-3 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <AppIcon name="icon-participant" size={16} />
                <span className="text-2xl font-bold">{totalParticipants}</span>
              </div>
              <div className="text-xs text-tg-hint">{t('participants')}</div>
            </div>
            <div className="bg-tg-secondary rounded-xl p-3 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <AppIcon name="icon-winner" size={16} />
                <span className="text-2xl font-bold">{winners.length}</span>
              </div>
              <div className="text-xs text-tg-hint">{t('winnersCount')}</div>
            </div>
          </div>

          {/* My result block */}
          {isParticipant && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3, duration: 0.4 }}
              className="mb-6"
            >
              {isWinner ? (
                <div className="rounded-2xl p-5 bg-gradient-to-br from-yellow-500/15 via-orange-500/10 to-amber-500/15 border border-yellow-500/25 relative overflow-hidden">
                  <div className="text-center relative z-10">
                    <div className="flex justify-center mb-3">
                      <Mascot type="participant-winner" size={64} loop autoplay />
                    </div>
                    <h2 className="text-lg font-bold bg-gradient-to-r from-yellow-500 to-orange-500 bg-clip-text text-transparent">
                      {t('myResult.congratulations')}
                    </h2>
                    <p className="text-sm mt-1 text-tg-text">
                      {t('myResult.place', { place: myResult?.place ?? 1 })}
                    </p>
                    
                    {prizeDeliveryMethod && (
                      <div className="mt-4 p-3 bg-tg-bg/80 rounded-xl border border-yellow-500/15 text-left backdrop-blur-sm">
                        <div className="flex items-start gap-2 mb-2">
                          <AppIcon name="icon-giveaway" size={16} />
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
                    
                    <div className="mt-4 space-y-2">
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
                        className="w-full relative overflow-hidden bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
                      >
                        <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 animate-[shimmer-delayed_5s_ease-in-out_2.5s_infinite]" />
                        <AppIcon name="icon-share" size={16} />
                        <span>{t('myResult.shareVictory')}</span>
                      </button>
                      
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
                          className="w-full bg-tg-secondary text-tg-text rounded-xl py-3 text-sm font-medium flex items-center justify-center gap-2"
                        >
                          <AppIcon name="icon-notification" size={16} />
                          <span>{t('myResult.contactCreator')}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl p-5 bg-tg-secondary text-center">
                  <div className="flex justify-center mb-3">
                    <Mascot type="participant-lost" size={80} loop autoplay className="opacity-80" />
                  </div>
                  <p className="text-tg-text font-medium">{t('myResult.notWinner')}</p>
                  <p className="text-sm text-tg-hint mt-1">{t('myResult.goodLuck')} 🍀</p>
                  
                  <button
                    onClick={() => router.push('/catalog')}
                    className="mt-4 w-full relative overflow-hidden bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
                  >
                    <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 animate-[shimmer-delayed_5s_ease-in-out_2.5s_infinite]" />
                    <AppIcon name="icon-giveaway" size={16} />
                    <span>{t('myResult.moreCatalog')}</span>
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {/* Winners list */}
          <div className="bg-tg-secondary rounded-2xl p-4 mb-6">
            <h2 className="font-semibold mb-4 flex items-center gap-2">
              <AppIcon name="icon-winner" size={16} />
              <span>{t('winners')}</span>
            </h2>
            
            {winners.length === 0 ? (
              <p className="text-tg-hint text-center py-4">{t('noWinners')}</p>
            ) : (
              <div className="space-y-2">
                {winners.map((winner) => {
                  const colorClass = winner.place <= 3
                    ? placeColors[winner.place - 1]
                    : 'from-tg-button/80 to-tg-button text-tg-button-text shadow-tg-button/20';

                  return (
                    <div
                      key={winner.place}
                      className="flex items-center gap-3 bg-tg-bg rounded-xl p-3"
                    >
                      <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${colorClass} flex items-center justify-center font-bold text-lg shadow-lg flex-shrink-0`}>
                        {winner.place}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm flex items-center gap-1.5 truncate">
                          <AppIcon name="icon-winner" size={14} />
                          <span className="truncate">{formatUserName(winner.user)}</span>
                        </div>
                        {winner.user.username && winner.user.firstName && (
                          <div className="text-xs text-tg-hint ml-[20px]">
                            @{winner.user.username}
                          </div>
                        )}
                      </div>
                      
                      <div className="text-right flex items-center gap-1 text-sm text-tg-hint">
                        <AppIcon name="icon-ticket" size={14} />
                        <span>{winner.ticketsUsed}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Home button */}
          <button
            onClick={() => router.push('/')}
            className="w-full bg-tg-secondary text-tg-text rounded-xl py-3 font-medium"
          >
            {tCommon('goHome')}
          </button>
        </motion.div>
      </AnimatePresence>
    </main>
  );
}
