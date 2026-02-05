'use client';

import { useEffect, useRef, useCallback } from 'react';
import { config } from '@/lib/config';

// Типы для Telegram Login Widget
interface TelegramLoginResult {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

// Расширяем Window для Telegram callback
declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramLoginResult) => void;
  }
}

interface TelegramLoginButtonProps {
  onAuth: (user: TelegramLoginResult) => void;
  buttonSize?: 'small' | 'medium' | 'large';
  cornerRadius?: number;
  showUserPhoto?: boolean;
  requestAccess?: 'write';
  lang?: string;
}

export function TelegramLoginButton({
  onAuth,
  buttonSize = 'large',
  cornerRadius = 10,
  showUserPhoto = true,
  requestAccess,
  lang = 'ru',
}: TelegramLoginButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Сохраняем callback в window
  const handleAuth = useCallback((user: TelegramLoginResult) => {
    onAuth(user);
  }, [onAuth]);

  useEffect(() => {
    // Устанавливаем глобальный callback
    window.onTelegramAuth = handleAuth;

    // Создаём скрипт Telegram Login Widget
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.setAttribute('data-telegram-login', config.botUsername);
    script.setAttribute('data-size', buttonSize);
    script.setAttribute('data-radius', cornerRadius.toString());
    script.setAttribute('data-onauth', 'onTelegramAuth(user)');
    script.setAttribute('data-userpic', showUserPhoto.toString());
    script.setAttribute('data-lang', lang);
    
    if (requestAccess) {
      script.setAttribute('data-request-access', requestAccess);
    }

    // Очищаем контейнер и добавляем скрипт
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(script);
    }

    // Cleanup
    return () => {
      delete window.onTelegramAuth;
    };
  }, [buttonSize, cornerRadius, showUserPhoto, requestAccess, lang, handleAuth]);

  return (
    <div ref={containerRef} className="flex justify-center">
      {/* Telegram widget будет вставлен сюда */}
      <div className="animate-pulse bg-gray-200 rounded-lg h-10 w-48" />
    </div>
  );
}
