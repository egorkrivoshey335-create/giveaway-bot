'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { config } from '@/lib/config';
import { getMe, logout } from '@/lib/api';

// Данные пользователя из cookie
interface UserData {
  firstName: string;
  lastName: string;
  username: string;
  photoUrl: string;
  telegramUserId: string;
}

interface HeaderProps {
  // Если передан — не делаем запрос getMe (уже знаем статус)
  isAuthenticated?: boolean;
}

/**
 * Читает cookie rb_site_user (данные пользователя для отображения)
 */
function getUserFromCookie(): UserData | null {
  if (typeof document === 'undefined') return null;
  
  const cookies = document.cookie.split('; ');
  const userCookie = cookies.find(c => c.startsWith('rb_site_user='));
  if (!userCookie) return null;
  
  try {
    const value = decodeURIComponent(userCookie.split('=').slice(1).join('='));
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * Получает инициалы из имени
 */
function getInitials(user: UserData): string {
  const first = user.firstName?.[0] || '';
  const last = user.lastName?.[0] || '';
  return (first + last).toUpperCase() || '?';
}

export function Header({ isAuthenticated: initialAuth }: HeaderProps) {
  const [isAuth, setIsAuth] = useState(initialAuth ?? false);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [checked, setChecked] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Читаем cookie и проверяем сессию
  useEffect(() => {
    const user = getUserFromCookie();
    if (user) {
      setUserData(user);
      setIsAuth(true);
    }

    // Если initialAuth не передан — проверяем через API
    if (initialAuth === undefined && !checked) {
      getMe()
        .then(res => {
          if (res.ok && res.user) {
            setIsAuth(true);
          } else {
            setIsAuth(false);
            setUserData(null);
          }
        })
        .catch(() => {
          // Не авторизован — ок
        })
        .finally(() => setChecked(true));
    }
  }, [initialAuth, checked]);

  // Закрытие выпадающего меню при клике снаружи
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDropdown]);

  // Выход
  const handleLogout = async () => {
    try {
      await logout();
    } catch { /* игнорируем */ }
    // Удаляем cookie с данными пользователя
    document.cookie = 'rb_site_user=; path=/; max-age=0';
    document.cookie = `${config.sessionCookieName}=; path=/; max-age=0`;
    setIsAuth(false);
    setUserData(null);
    setShowDropdown(false);
    window.location.href = '/';
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Логотип */}
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">🎁</span>
            <span className="text-xl font-bold">
              Random<span className="text-brand-400">Beast</span>
            </span>
          </Link>

          {/* Навигация */}
          <nav className="hidden md:flex items-center gap-6">
            <a
              href={`https://t.me/${config.botUsername}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              Бот
            </a>
            <Link
              href="/dashboard"
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              Рандомайзер
            </Link>
          </nav>

          {/* Кнопка входа / профиль */}
          <div className="flex items-center gap-4">
            {isAuth ? (
              <div className="relative" ref={dropdownRef}>
                {/* Аватарка / кнопка профиля */}
                <button
                  onClick={() => setShowDropdown(!showDropdown)}
                  className="flex items-center gap-2 rounded-full hover:opacity-80 transition-opacity"
                >
                  {userData?.photoUrl ? (
                    <Image
                      src={userData.photoUrl}
                      alt="Avatar"
                      width={36}
                      height={36}
                      className="w-9 h-9 rounded-full object-cover ring-2 ring-brand-300"
                      unoptimized
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-brand-500 text-white flex items-center justify-center text-sm font-bold ring-2 ring-brand-300">
                      {userData ? getInitials(userData) : '?'}
                    </div>
                  )}
                  <span className="hidden sm:block text-sm font-medium text-gray-700 max-w-[120px] truncate">
                    {userData?.firstName || 'Профиль'}
                  </span>
                  <svg className={`w-4 h-4 text-gray-500 transition-transform ${showDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Выпадающее меню */}
                {showDropdown && (
                  <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden z-50">
                    {/* Информация о пользователе */}
                    <div className="p-4 bg-gradient-to-r from-brand-50 to-white border-b border-gray-100">
                      <div className="flex items-center gap-3">
                        {userData?.photoUrl ? (
                          <Image
                            src={userData.photoUrl}
                            alt="Avatar"
                            width={48}
                            height={48}
                            className="w-12 h-12 rounded-full object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-brand-500 text-white flex items-center justify-center text-lg font-bold">
                            {userData ? getInitials(userData) : '?'}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 truncate">
                            {userData?.firstName} {userData?.lastName}
                          </p>
                          {userData?.username && (
                            <p className="text-sm text-gray-500 truncate">@{userData.username}</p>
                          )}
                          <p className="text-xs text-gray-400">ID: {userData?.telegramUserId}</p>
                        </div>
                      </div>
                    </div>

                    {/* Пункты меню */}
                    <div className="py-1">
                      <Link
                        href="/dashboard"
                        onClick={() => setShowDropdown(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <span>🎰</span>
                        <span>Мои розыгрыши</span>
                      </Link>
                      <a
                        href={`https://t.me/${config.botUsername}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <span>🤖</span>
                        <span>Открыть бота</span>
                      </a>
                    </div>

                    {/* Выход */}
                    <div className="border-t border-gray-100 py-1">
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors w-full text-left"
                      >
                        <span>🚪</span>
                        <span>Выйти</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Link
                href="/login"
                className="btn-primary text-sm py-2 px-4"
              >
                Войти
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
