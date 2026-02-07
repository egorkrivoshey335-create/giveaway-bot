'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getCatalog, CatalogGiveaway, createPayment } from '@/lib/api';

// Тип для функции перевода (упрощённый для передачи как пропс)
type TranslateFunc = (key: string, values?: Record<string, string | number | Date>) => string;

// Форматирование оставшегося времени
function formatTimeLeft(
  endAt: string,
  t: TranslateFunc
): string {
  const end = new Date(endAt);
  const now = new Date();
  const diff = end.getTime() - now.getTime();

  if (diff <= 0) return t('time.ending');

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 0) return t('time.daysHours', { days, hours });
  return t('time.hours', { hours });
}

// Форматирование числа (1500 → 1.5K)
function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

// Карточка розыгрыша в каталоге (всегда заблюрена без подписки)
function CatalogCard({
  giveaway,
  t,
}: {
  giveaway: CatalogGiveaway;
  t: TranslateFunc;
}) {
  return (
    <div className="bg-tg-secondary rounded-xl overflow-hidden">
      <div className="p-4">
        {/* Информация о канале */}
        {giveaway.channel && (
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">📢</span>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{giveaway.channel.title}</div>
              <div className="text-xs text-tg-hint">
                {giveaway.channel.username || `${formatNumber(giveaway.channel.subscribersCount)} ${t('subscribers')}`}
              </div>
            </div>
          </div>
        )}

        {/* Название розыгрыша */}
        <h3 className="font-semibold line-clamp-2 mb-3">{giveaway.title}</h3>

        {/* Статистика */}
        <div className="flex items-center gap-4 text-sm text-tg-hint">
          <span className="flex items-center gap-1">
            <span>👥</span>
            <span>{formatNumber(giveaway.participantsCount)}</span>
          </span>
          <span className="flex items-center gap-1">
            <span>🏆</span>
            <span>{giveaway.winnersCount}</span>
          </span>
          {giveaway.endAt && (
            <span className="flex items-center gap-1">
              <span>⏰</span>
              <span>{formatTimeLeft(giveaway.endAt, t)}</span>
            </span>
          )}
        </div>
      </div>

      {/* Кнопка */}
      <div className="border-t border-tg-bg px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-tg-link">{t('participate')}</span>
          <span className="text-tg-hint">→</span>
        </div>
      </div>
    </div>
  );
}

// Карточка для пользователя с доступом (кликабельная)
function CatalogCardWithAccess({
  giveaway,
  onClick,
  t,
}: {
  giveaway: CatalogGiveaway;
  onClick: () => void;
  t: TranslateFunc;
}) {
  return (
    <div
      className="bg-tg-secondary rounded-xl overflow-hidden cursor-pointer hover:bg-tg-secondary/80 transition-all"
      onClick={onClick}
    >
      <div className="p-4">
        {/* Информация о канале */}
        {giveaway.channel && (
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">📢</span>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{giveaway.channel.title}</div>
              <div className="text-xs text-tg-hint">
                {giveaway.channel.username || `${formatNumber(giveaway.channel.subscribersCount)} ${t('subscribers')}`}
              </div>
            </div>
          </div>
        )}

        {/* Название розыгрыша */}
        <h3 className="font-semibold line-clamp-2 mb-3">{giveaway.title}</h3>

        {/* Статистика */}
        <div className="flex items-center gap-4 text-sm text-tg-hint">
          <span className="flex items-center gap-1">
            <span>👥</span>
            <span>{formatNumber(giveaway.participantsCount)}</span>
          </span>
          <span className="flex items-center gap-1">
            <span>🏆</span>
            <span>{giveaway.winnersCount}</span>
          </span>
          {giveaway.endAt && (
            <span className="flex items-center gap-1">
              <span>⏰</span>
              <span>{formatTimeLeft(giveaway.endAt, t)}</span>
            </span>
          )}
        </div>
      </div>

      {/* Кнопка */}
      <div className="border-t border-tg-bg px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-tg-link">{t('participate')}</span>
          <span className="text-tg-hint">→</span>
        </div>
      </div>
    </div>
  );
}

// Полноэкранный Paywall overlay — блокирует весь контент
function PaywallFullOverlay({
  total,
  price,
  onShowModal,
  t,
}: {
  total: number;
  price: number;
  onShowModal: () => void;
  t: TranslateFunc;
}) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col">
      {/* Градиент сверху вниз — контент виден, но затемнён */}
      <div className="flex-1 bg-gradient-to-b from-transparent via-tg-bg/70 to-tg-bg pointer-events-none" />
      
      {/* Блок с информацией о подписке */}
      <div className="bg-tg-bg p-4">
        <div className="bg-tg-secondary rounded-xl p-6 text-center">
          <div className="text-4xl mb-3">🔒</div>
          <h3 className="text-xl font-bold mb-2">{t('giveawaysCount', { count: total })}</h3>
          <p className="text-tg-hint text-sm mb-4">
            {t('paywall.description')}
          </p>

          <div className="mb-4">
            <span className="text-2xl font-bold">{price} ₽</span>
            <span className="text-tg-hint"> {t('paywall.perMonth')}</span>
          </div>

          <button
            onClick={onShowModal}
            className="w-full bg-tg-button text-tg-button-text rounded-xl py-3 px-4 font-medium"
          >
            {t('paywall.unlock')}
          </button>
        </div>
      </div>
    </div>
  );
}

// Модалка подписки
function SubscriptionModal({ 
  price, 
  onClose, 
  t, 
  tErrors 
}: { 
  price: number; 
  onClose: () => void; 
  t: TranslateFunc;
  tErrors: (key: string) => string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePay = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await createPayment({ productCode: 'CATALOG_MONTHLY_1000' });

      if (response.ok && response.paymentUrl) {
        // Редирект на страницу оплаты ЮKassa
        window.location.href = response.paymentUrl;
      } else {
        setError(response.error || t('paywall.paymentError'));
      }
    } catch {
      setError(tErrors('connectionError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-tg-bg rounded-2xl p-6 max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Заголовок */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">🎁 {t('paywall.modalTitle')}</h2>
          <button
            onClick={onClose}
            className="text-tg-hint hover:text-tg-text text-xl"
            disabled={loading}
          >
            ✕
          </button>
        </div>

        {/* Преимущества */}
        <div className="space-y-3 mb-6">
          <div className="flex items-center gap-3">
            <span className="text-green-500">✅</span>
            <span className="text-sm">{t('paywall.features.access')}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-green-500">✅</span>
            <span className="text-sm">{t('paywall.features.noCaptcha')}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-green-500">✅</span>
            <span className="text-sm">{t('paywall.features.notifications')}</span>
          </div>
        </div>

        {/* Цена */}
        <div className="bg-tg-secondary rounded-xl p-4 text-center mb-4">
          <span className="text-3xl font-bold">{price} ₽</span>
          <span className="text-tg-hint"> {t('paywall.perMonth')}</span>
        </div>

        {/* Ошибка */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4 text-center">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}

        {/* Кнопка оплаты */}
        <button
          onClick={handlePay}
          disabled={loading}
          className="w-full bg-tg-button text-tg-button-text rounded-xl py-3 px-4 font-medium mb-3 disabled:opacity-50"
        >
          {loading ? t('paywall.loading') : t('paywall.pay')}
        </button>

        <p className="text-xs text-tg-hint text-center">
          {t('paywall.secure')}
        </p>
      </div>
    </div>
  );
}

export default function CatalogPage() {
  const router = useRouter();
  const t = useTranslations('catalog');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  
  const [giveaways, setGiveaways] = useState<CatalogGiveaway[]>([]);
  const [hasAccess, setHasAccess] = useState(false);
  const [total, setTotal] = useState(0);
  const [previewCount, setPreviewCount] = useState(3);
  const [price, setPrice] = useState(1000);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadCatalog = useCallback(async (append = false, offset = 0) => {
    if (!append) setLoading(true);
    else setLoadingMore(true);

    try {
      const res = await getCatalog({ limit: 20, offset });
      if (res.ok) {
        if (append) {
          setGiveaways((prev) => [...prev, ...(res.giveaways || [])]);
        } else {
          setGiveaways(res.giveaways || []);
        }
        setHasAccess(res.hasAccess || false);
        setTotal(res.total || 0);
        setPreviewCount(res.previewCount || 3);
        setPrice(res.subscriptionPrice || 1000);
        setHasMore(res.hasMore || false);
      } else {
        setError(res.error || tErrors('loadFailed'));
      }
    } catch (err) {
      setError(tErrors('connectionError'));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [tErrors]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const handleLoadMore = () => {
    loadCatalog(true, giveaways.length);
  };

  const goBack = () => {
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-tg-bg">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-tg-bg border-b border-tg-secondary">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={goBack} className="text-tg-link text-sm hover:opacity-70">
            ← {tCommon('back')}
          </button>
          <h1 className="text-lg font-semibold text-tg-text flex-1">
            {t('title')}
          </h1>
        </div>
      </header>

      {/* Загрузка */}
      {loading ? (
        <div className="max-w-xl mx-auto p-4">
          <div className="text-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-tg-button border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-tg-hint">{tCommon('loading')}</p>
          </div>
        </div>
      ) : error ? (
        <div className="max-w-xl mx-auto p-4">
          <div className="text-center py-12 bg-tg-secondary rounded-xl">
            <div className="text-4xl mb-4">❌</div>
            <p className="text-tg-hint mb-4">{error}</p>
            <button
              onClick={() => loadCatalog()}
              className="bg-tg-button text-tg-button-text rounded-lg px-4 py-2"
            >
              {tCommon('tryAgain')}
            </button>
          </div>
        </div>
      ) : giveaways.length === 0 ? (
        <div className="max-w-xl mx-auto p-4">
          <div className="text-center py-12 bg-tg-secondary rounded-xl">
            <div className="text-6xl mb-4">🎁</div>
            <h2 className="text-xl font-semibold mb-2">{t('empty')}</h2>
            <p className="text-tg-hint mb-6">{t('emptySubtitle')}</p>
            
            {/* Кнопка подписки для тестирования оплаты */}
            {!hasAccess && (
              <div className="border-t border-tg-bg pt-6 mt-6">
                <p className="text-sm text-tg-hint mb-4">
                  {t('getAccessEarly')}
                </p>
                <button
                  onClick={() => setShowModal(true)}
                  className="bg-tg-button text-tg-button-text rounded-xl py-3 px-6 font-medium"
                >
                  {t('paywall.unlock')} {price} ₽
                </button>
              </div>
            )}
            
            {hasAccess && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 mt-4">
                <p className="text-sm text-green-600">{t('hasAccess')}</p>
              </div>
            )}
          </div>
        </div>
      ) : hasAccess ? (
        /* С подпиской — полный доступ */
        <div className="max-w-xl mx-auto p-4">
          <p className="text-tg-hint text-sm mb-4">
            {t('subtitle')}
          </p>

          {/* Список розыгрышей — кликабельные */}
          <div className="grid gap-4">
            {giveaways.map((g) => (
              <CatalogCardWithAccess
                key={g.id}
                giveaway={g}
                onClick={() => router.push(`/join/${g.id}`)}
                t={t}
              />
            ))}
          </div>

          {/* Загрузить ещё */}
          {hasMore && (
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="w-full mt-4 bg-tg-secondary text-tg-text rounded-xl py-3 px-4 font-medium hover:bg-tg-secondary/80 transition-colors"
            >
              {loadingMore ? tCommon('loading') : t('loadMore')}
            </button>
          )}
        </div>
      ) : (
        /* Без подписки — всё заблокировано overlay'ем */
        <div className="relative flex-1">
          {/* Контент за overlay — виден, но не кликабелен */}
          <div className="max-w-xl mx-auto p-4 pointer-events-none">
            <p className="text-tg-hint text-sm mb-4">
              {t('subtitle')}
            </p>

            {/* Показываем только превью карточек */}
            <div className="grid gap-4">
              {giveaways.slice(0, previewCount).map((g) => (
                <CatalogCard key={g.id} giveaway={g} t={t} />
              ))}
            </div>
          </div>

          {/* Полноэкранный paywall overlay */}
          <PaywallFullOverlay
            total={total}
            price={price}
            onShowModal={() => setShowModal(true)}
            t={t}
          />
        </div>
      )}

      {/* Модалка подписки */}
      {showModal && (
        <SubscriptionModal price={price} onClose={() => setShowModal(false)} t={t} tErrors={tErrors} />
      )}
    </div>
  );
}
