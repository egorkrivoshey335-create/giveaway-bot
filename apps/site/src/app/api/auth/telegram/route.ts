import { NextRequest, NextResponse } from 'next/server';
import { createHash, createHmac } from 'crypto';
import { config } from '@/lib/config';

// Секретный ключ для подписи (из env)
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const INTERNAL_API_TOKEN = process.env.INTERNAL_API_TOKEN || '';
const API_URL = process.env.API_URL || 'http://localhost:4000';

// Типы данных от Telegram Login Widget
interface TelegramAuthData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

/**
 * Проверяет подпись данных от Telegram Login Widget
 * https://core.telegram.org/widgets/login#checking-authorization
 */
function verifyTelegramAuth(data: TelegramAuthData): boolean {
  const { hash, ...authData } = data;

  // Собираем строку для проверки
  const dataCheckString = Object.entries(authData)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  // Создаём секретный ключ (SHA256 от BOT_TOKEN для Telegram Login Widget)
  // https://core.telegram.org/widgets/login#checking-authorization
  const secretKey = createHash('sha256')
    .update(BOT_TOKEN)
    .digest();

  // Вычисляем хэш
  const computedHash = createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  return computedHash === hash;
}

/**
 * POST /api/auth/telegram
 * Обрабатывает авторизацию через Telegram Login Widget
 */
export async function POST(request: NextRequest) {
  try {
    const data: TelegramAuthData = await request.json();

    // Проверяем наличие обязательных полей
    if (!data.id || !data.auth_date || !data.hash) {
      return NextResponse.json(
        { ok: false, error: 'Неверные данные авторизации' },
        { status: 400 }
      );
    }

    // Проверяем, что BOT_TOKEN настроен
    if (!BOT_TOKEN) {
      console.error('BOT_TOKEN не настроен');
      return NextResponse.json(
        { ok: false, error: 'Ошибка конфигурации сервера' },
        { status: 500 }
      );
    }

    // Проверяем подпись
    if (!verifyTelegramAuth(data)) {
      return NextResponse.json(
        { ok: false, error: 'Неверная подпись' },
        { status: 401 }
      );
    }

    // Проверяем, что auth_date не старше 1 дня
    const authTimestamp = data.auth_date * 1000;
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    if (authTimestamp < oneDayAgo) {
      return NextResponse.json(
        { ok: false, error: 'Данные авторизации устарели' },
        { status: 401 }
      );
    }

    // Отправляем данные на основной API для создания/обновления пользователя
    const apiResponse = await fetch(`${API_URL}/site/auth/telegram`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': INTERNAL_API_TOKEN,
      },
      body: JSON.stringify({
        telegramUserId: data.id.toString(),
        username: data.username,
        firstName: data.first_name,
        lastName: data.last_name,
        photoUrl: data.photo_url,
      }),
    });

    const apiData = await apiResponse.json();

    if (!apiResponse.ok || !apiData.ok) {
      console.error('Ошибка API:', apiData);
      return NextResponse.json(
        { ok: false, error: apiData.error || 'Ошибка создания сессии' },
        { status: 500 }
      );
    }

    // Создаём ответ с cookie
    const response = NextResponse.json({ ok: true });

    // Устанавливаем cookie сессии
    // domain нужен чтобы cookie отправлялся и на api.randombeast.ru
    const cookieDomain = process.env.COOKIE_DOMAIN || undefined;
    response.cookies.set(config.sessionCookieName, apiData.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 дней
      path: '/',
      domain: cookieDomain,
    });

    return response;
  } catch (error) {
    console.error('Ошибка авторизации:', error);
    return NextResponse.json(
      { ok: false, error: 'Ошибка сервера' },
      { status: 500 }
    );
  }
}
