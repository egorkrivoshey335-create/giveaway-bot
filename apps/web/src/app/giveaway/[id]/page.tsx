'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { submitReport, ReportReason } from '@/lib/api';

// ============================================================================
// Типы
// ============================================================================

interface GiveawayInfo {
  id: string;
  title: string;
  status: string;
  type: string;
  winnersCount: number;
  totalParticipants: number;
  endAt: string | null;
  creatorUsername: string | null;
  creatorFirstName: string | null;
}

// ============================================================================
// Report BottomSheet
// ============================================================================

const REPORT_REASONS: ReportReason[] = [
  'SPAM',
  'FRAUD',
  'INAPPROPRIATE_CONTENT',
  'FAKE_GIVEAWAY',
  'OTHER',
];

interface ReportBottomSheetProps {
  giveawayId: string;
  onClose: () => void;
}

function ReportBottomSheet({ giveawayId, onClose }: ReportBottomSheetProps) {
  const t = useTranslations('report');
  const [selectedReason, setSelectedReason] = useState<ReportReason | null>(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!selectedReason) return;

    setSubmitting(true);
    setError(null);

    try {
      const result = await submitReport({
        targetType: 'GIVEAWAY',
        targetId: giveawayId,
        reason: selectedReason,
        description: description.trim() || undefined,
      });

      if (result.ok) {
        setSubmitted(true);
        setTimeout(onClose, 2500);
      } else if (result.error === 'You have already reported this') {
        setError(t('alreadyReported'));
      } else {
        setError(result.error || 'Ошибка');
      }
    } catch {
      setError('Ошибка отправки. Попробуйте позже.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-tg-bg rounded-t-2xl shadow-xl max-h-[85vh] overflow-y-auto">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-tg-hint/40" />
        </div>

        <div className="px-4 pb-8 pt-2">
          {submitted ? (
            /* Успех */
            <div className="text-center py-8">
              <div className="text-5xl mb-4">✅</div>
              <h3 className="text-lg font-semibold mb-2">{t('successTitle')}</h3>
              <p className="text-tg-hint text-sm">{t('successMessage')}</p>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold mb-1">{t('title')}</h2>
              <p className="text-tg-hint text-sm mb-4">{t('subtitle')}</p>

              {/* Причины */}
              <div className="space-y-2 mb-4">
                {REPORT_REASONS.map(reason => (
                  <button
                    key={reason}
                    onClick={() => setSelectedReason(reason)}
                    className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                      selectedReason === reason
                        ? 'border-rose-400 bg-rose-50/10 text-tg-text'
                        : 'border-tg-secondary/30 bg-tg-secondary/10 text-tg-text'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                        selectedReason === reason
                          ? 'border-rose-400 bg-rose-400'
                          : 'border-tg-hint'
                      }`} />
                      {t(`reasons.${reason}`)}
                    </span>
                  </button>
                ))}
              </div>

              {/* Дополнительное описание */}
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder={t('descriptionPlaceholder')}
                maxLength={1000}
                rows={3}
                className="w-full bg-tg-secondary/20 rounded-xl px-4 py-3 text-sm text-tg-text placeholder-tg-hint resize-none border border-tg-secondary/30 focus:outline-none focus:border-rose-400 mb-4"
              />

              {/* Ошибка */}
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-500 text-sm mb-4">
                  {error}
                </div>
              )}

              {/* Кнопки */}
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 py-3 rounded-xl bg-tg-secondary/20 text-tg-text font-medium"
                >
                  Отмена
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!selectedReason || submitting}
                  className="flex-1 py-3 rounded-xl bg-rose-500 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {submitting ? t('submitting') : t('submit')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ============================================================================
// Основная страница
// ============================================================================

export default function GiveawayViewPage() {
  const params = useParams();
  const router = useRouter();
  const giveawayId = params.id as string;

  const t = useTranslations('report');
  const tCommon = useTranslations('common');

  const [loading, setLoading] = useState(true);
  const [giveaway, setGiveaway] = useState<GiveawayInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);

  const loadGiveaway = useCallback(async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const res = await fetch(`${API_URL}/giveaways/${giveawayId}/public`, {
        credentials: 'include',
      });

      if (!res.ok) {
        if (res.status === 404) {
          setError('Розыгрыш не найден');
        } else {
          setError('Не удалось загрузить данные');
        }
        setLoading(false);
        return;
      }

      const data = await res.json() as { ok: boolean; giveaway?: GiveawayInfo; error?: string };

      if (data.ok && data.giveaway) {
        setGiveaway(data.giveaway);
      } else {
        setError(data.error || 'Ошибка загрузки');
      }
    } catch {
      setError('Не удалось загрузить данные');
    } finally {
      setLoading(false);
    }
  }, [giveawayId]);

  useEffect(() => {
    loadGiveaway();
  }, [loadGiveaway]);

  // Загрузка
  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-tg-bg">
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-4 border-tg-button border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-tg-hint">{tCommon('loading')}</p>
        </div>
      </main>
    );
  }

  // Ошибка
  if (error || !giveaway) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-tg-bg p-4">
        <div className="text-center max-w-sm">
          <div className="text-6xl mb-4">😕</div>
          <h1 className="text-xl font-bold mb-2">{tCommon('error')}</h1>
          <p className="text-tg-hint mb-6">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="bg-tg-button text-tg-button-text rounded-xl px-6 py-3 font-medium"
          >
            {tCommon('goHome')}
          </button>
        </div>
      </main>
    );
  }

  // Статус-бейдж
  const statusBadge: Record<string, { label: string; color: string }> = {
    ACTIVE: { label: 'Активен', color: 'bg-green-500/15 text-green-500' },
    FINISHED: { label: 'Завершён', color: 'bg-gray-500/15 text-gray-400' },
    CANCELLED: { label: 'Отменён', color: 'bg-red-500/15 text-red-400' },
    SCHEDULED: { label: 'Запланирован', color: 'bg-blue-500/15 text-blue-500' },
  };
  const badge = statusBadge[giveaway.status] || { label: giveaway.status, color: 'bg-gray-500/15 text-gray-400' };

  // Форматирование даты
  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));

  return (
    <main className="min-h-screen bg-tg-bg pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-tg-bg/95 backdrop-blur border-b border-tg-secondary/20 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-full hover:bg-tg-secondary/20 transition-colors"
          aria-label="Назад"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <h1 className="text-base font-semibold flex-1 truncate">{giveaway.title}</h1>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.color}`}>
          {badge.label}
        </span>
      </div>

      <div className="px-4 pt-5 space-y-4 max-w-lg mx-auto">
        {/* Основная карточка */}
        <div className="bg-tg-secondary/10 rounded-2xl p-5 space-y-3">
          <h2 className="text-xl font-bold">{giveaway.title}</h2>

          {giveaway.creatorUsername || giveaway.creatorFirstName ? (
            <p className="text-sm text-tg-hint">
              Организатор:{' '}
              <span className="text-tg-text">
                {giveaway.creatorUsername ? `@${giveaway.creatorUsername}` : giveaway.creatorFirstName}
              </span>
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="bg-tg-bg rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-tg-text">{giveaway.winnersCount}</p>
              <p className="text-xs text-tg-hint mt-0.5">победителей</p>
            </div>
            <div className="bg-tg-bg rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-tg-text">{giveaway.totalParticipants}</p>
              <p className="text-xs text-tg-hint mt-0.5">участников</p>
            </div>
          </div>

          {giveaway.endAt && (
            <div className="flex items-center gap-2 text-sm text-tg-hint pt-1">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2" strokeLinecap="round"/>
              </svg>
              {giveaway.status === 'FINISHED' ? 'Завершён: ' : 'Завершится: '}
              {formatDate(giveaway.endAt)}
            </div>
          )}
        </div>

        {/* Кнопка результатов если завершён */}
        {giveaway.status === 'FINISHED' && (
          <button
            onClick={() => router.push(`/giveaway/${giveawayId}/results`)}
            className="w-full bg-tg-button text-tg-button-text rounded-xl py-4 font-semibold text-base"
          >
            🏆 Смотреть результаты
          </button>
        )}
      </div>

      {/* Кнопка жалобы — внизу страницы, мелкая */}
      <div className="fixed bottom-6 left-0 right-0 flex justify-center px-4 pointer-events-none">
        <button
          onClick={() => setShowReport(true)}
          className="pointer-events-auto text-xs text-tg-hint/60 hover:text-tg-hint transition-colors py-2 px-4 rounded-lg"
        >
          {t('buttonLabel')}
        </button>
      </div>

      {/* Report BottomSheet */}
      {showReport && (
        <ReportBottomSheet
          giveawayId={giveawayId}
          onClose={() => setShowReport(false)}
        />
      )}
    </main>
  );
}
