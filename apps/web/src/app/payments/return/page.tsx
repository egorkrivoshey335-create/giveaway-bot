'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { checkPaymentStatus } from '@/lib/api';

type PaymentStatus = 'loading' | 'success' | 'pending' | 'error';

function PaymentReturnContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations('payment');
  const tCommon = useTranslations('common');
  
  const [status, setStatus] = useState<PaymentStatus>('loading');
  const [productTitle, setProductTitle] = useState<string>('');
  const [checkCount, setCheckCount] = useState(0);

  const checkStatus = useCallback(async (purchaseId: string) => {
    try {
      const result = await checkPaymentStatus(purchaseId);

      if (result.ok) {
        if (result.productTitle) {
          setProductTitle(result.productTitle);
        }

        if (result.status === 'COMPLETED') {
          setStatus('success');
        } else if (result.status === 'PENDING') {
          setStatus('pending');
          // Ограничиваем количество проверок
          if (checkCount < 10) {
            setCheckCount((c) => c + 1);
            setTimeout(() => checkStatus(purchaseId), 3000);
          } else {
            // Слишком долго ждём — показываем успех (webhook мог прийти)
            setStatus('success');
          }
        } else {
          setStatus('error');
        }
      } else {
        setStatus('error');
      }
    } catch (err) {
      setStatus('error');
    }
  }, [checkCount]);

  useEffect(() => {
    const purchaseId = searchParams.get('purchaseId');
    if (purchaseId) {
      checkStatus(purchaseId);
    } else {
      setStatus('error');
    }
  }, [searchParams, checkStatus]);

  const goToCatalog = () => {
    router.push('/catalog');
  };

  const goHome = () => {
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-tg-bg flex items-center justify-center p-4">
      <div className="max-w-sm w-full">
        {/* Загрузка */}
        {status === 'loading' && (
          <div className="text-center">
            <div className="animate-spin w-12 h-12 border-4 border-tg-button border-t-transparent rounded-full mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">{t('processing')}</h2>
            <p className="text-tg-hint">{t('processingHint')}</p>
          </div>
        )}

        {/* Успех */}
        {status === 'success' && (
          <div className="text-center bg-tg-secondary rounded-2xl p-6">
            <div className="text-6xl mb-4">✅</div>
            <h2 className="text-xl font-bold mb-2">{t('success')}</h2>
            <p className="text-tg-hint mb-2">
              {productTitle || t('catalogAccess')} {t('activated')}
            </p>
            <p className="text-sm text-tg-hint mb-6">
              {t('accessDuration')}
            </p>
            <button
              onClick={goToCatalog}
              className="w-full bg-tg-button text-tg-button-text rounded-xl py-3 px-4 font-medium mb-3"
            >
              {t('goToCatalog')}
            </button>
            <button
              onClick={goHome}
              className="w-full text-tg-link text-sm"
            >
              {t('goHome')}
            </button>
          </div>
        )}

        {/* Ожидание */}
        {status === 'pending' && (
          <div className="text-center">
            <div className="animate-spin w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">{t('pending')}</h2>
            <p className="text-tg-hint mb-2">
              {t('pendingHint')}
            </p>
            <p className="text-xs text-tg-hint">
              {t('checkCount', { current: checkCount, max: 10 })}
            </p>
          </div>
        )}

        {/* Ошибка */}
        {status === 'error' && (
          <div className="text-center bg-tg-secondary rounded-2xl p-6">
            <div className="text-6xl mb-4">❌</div>
            <h2 className="text-xl font-bold mb-2">{t('error')}</h2>
            <p className="text-tg-hint mb-6">
              {t('errorHint')}
            </p>
            <button
              onClick={goToCatalog}
              className="w-full bg-tg-button text-tg-button-text rounded-xl py-3 px-4 font-medium mb-3"
            >
              {t('backToCatalog')}
            </button>
            <button
              onClick={goHome}
              className="w-full text-tg-link text-sm"
            >
              {t('goHome')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PaymentReturnPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-tg-bg flex items-center justify-center">
        <div className="animate-spin w-12 h-12 border-4 border-tg-button border-t-transparent rounded-full" />
      </div>
    }>
      <PaymentReturnContent />
    </Suspense>
  );
}
