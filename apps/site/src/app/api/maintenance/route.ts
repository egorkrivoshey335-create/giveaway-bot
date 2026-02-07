import { NextRequest, NextResponse } from 'next/server';

// Пароль для доступа
const MAINTENANCE_PASSWORD = process.env.MAINTENANCE_PASSWORD || '';

// Cookie для хранения доступа
const ACCESS_COOKIE = 'rb_site_access';

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();

    // Проверяем пароль
    if (password === MAINTENANCE_PASSWORD && MAINTENANCE_PASSWORD !== '') {
      // Создаём response с cookie
      const response = NextResponse.json({ ok: true });
      
      response.cookies.set(ACCESS_COOKIE, 'granted', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60, // 30 дней
        path: '/',
      });

      return response;
    }

    return NextResponse.json({ ok: false, error: 'Invalid password' }, { status: 401 });
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 });
  }
}
