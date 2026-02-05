import { cookies } from 'next/headers';
import { config } from './config';

// Данные пользователя Telegram от Login Widget
export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

/**
 * Проверяет наличие сессии на сервере (для Server Components)
 */
export async function getServerSession(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(config.sessionCookieName)?.value || null;
}

/**
 * Проверяет авторизован ли пользователь (для Server Components)
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getServerSession();
  return !!session;
}
