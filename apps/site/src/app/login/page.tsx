'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { TelegramLoginButton } from '@/components/TelegramLoginButton';
import { config } from '@/lib/config';

// Тип данных от Telegram Login Widget
interface TelegramLoginResult {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Обработчик авторизации через Telegram
  const handleAuth = async (user: TelegramLoginResult) => {
    setIsLoading(true);
    setError(null);

    try {
      // Отправляем данные на наш API
      const response = await fetch('/api/auth/telegram', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Ошибка авторизации');
      }

      // Успешная авторизация — редирект в dashboard
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Произошла ошибка');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white flex flex-col">
      <Header />

      <main className="flex-1 flex items-center justify-center px-4 pt-20">
        <div className="w-full max-w-md">
          {/* Карточка входа */}
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            {/* Иконка */}
            <div className="w-20 h-20 bg-brand-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-4xl">🔐</span>
            </div>

            {/* Заголовок */}
            <h1 className="text-2xl font-bold mb-2">Вход</h1>
            <p className="text-gray-600 mb-8">
              Войдите через Telegram, чтобы получить доступ
              к рандомайзеру и вашим розыгрышам
            </p>

            {/* Ошибка */}
            {error && (
              <div className="bg-red-50 text-red-600 rounded-lg p-4 mb-6 text-sm">
                {error}
              </div>
            )}

            {/* Кнопка Telegram Login */}
            {isLoading ? (
              <div className="flex items-center justify-center gap-3 text-gray-600">
                <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                <span>Авторизация...</span>
              </div>
            ) : (
              <TelegramLoginButton
                onAuth={handleAuth}
                buttonSize="large"
                cornerRadius={10}
              />
            )}

            {/* Дополнительная информация */}
            <p className="text-xs text-gray-500 mt-6">
              Авторизуясь, вы соглашаетесь с условиями использования сервиса
            </p>
          </div>

          {/* Ссылка на бота */}
          <div className="text-center mt-6">
            <p className="text-gray-600 text-sm">
              Ещё нет розыгрышей?{' '}
              <a
                href={`https://t.me/${config.botUsername}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-500 hover:text-brand-600 font-medium"
              >
                Создайте в боте
              </a>
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
