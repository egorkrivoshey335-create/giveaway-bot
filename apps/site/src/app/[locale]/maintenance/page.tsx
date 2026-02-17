'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

function MaintenanceForm() {
  const t = useTranslations('maintenance');
  const tCommon = useTranslations('common');
  
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (data.ok) {
        // Редирект на исходную страницу или главную
        const redirect = searchParams.get('redirect') || '/';
        router.push(redirect);
        router.refresh();
      } else {
        setError('Неверный пароль');
      }
    } catch {
      setError('Ошибка проверки');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Логотип */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-brand-pink to-purple-600 rounded-2xl mb-4">
            <span className="text-4xl">🎲</span>
          </div>
          <h1 className="text-3xl font-bold text-white">RandomBeast</h1>
        </div>

        {/* Карточка */}
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-8 border border-white/20">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-yellow-500/20 rounded-full mb-4">
              <span className="text-3xl">🔧</span>
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">
              {t('title')}
            </h2>
            <p className="text-gray-300 text-sm">
              {t('description')}
            </p>
          </div>

          {/* Форма пароля для тестировщиков */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-300 mb-2">
                Пароль для доступа
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Введите пароль"
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-brand-pink transition-colors"
                autoFocus
              />
            </div>

            {error && (
              <p className="text-red-400 text-sm text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full py-3 bg-gradient-to-r from-brand-pink to-purple-600 text-white font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? 'Проверка...' : 'Войти'}
            </button>
          </form>

          <p className="text-center text-gray-400 text-xs mt-6">
            Если у вас есть пароль для тестирования, введите его выше
          </p>
        </div>

        {/* Футер */}
        <p className="text-center text-gray-500 text-sm mt-6">
          © 2026 RandomBeast. Честные розыгрыши в Telegram.
        </p>
      </div>
    </div>
  );
}

export default function MaintenancePage() {
  const tCommon = useTranslations('common');
  
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center">
        <div className="text-white">{tCommon('loading')}</div>
      </div>
    }>
      <MaintenanceForm />
    </Suspense>
  );
}
