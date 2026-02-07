import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Пароль для доступа к сайту (если не установлен — сайт открыт)
const MAINTENANCE_PASSWORD = process.env.MAINTENANCE_PASSWORD || '';

// Cookie для хранения доступа
const ACCESS_COOKIE = 'rb_site_access';

// Пути которые не требуют авторизации
const PUBLIC_PATHS = [
  '/maintenance',
  '/api/maintenance',
  '/_next',
  '/favicon.ico',
];

export function middleware(request: NextRequest) {
  // Если пароль не установлен — пропускаем всех
  if (!MAINTENANCE_PASSWORD) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // Пропускаем публичные пути
  if (PUBLIC_PATHS.some(path => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Проверяем cookie доступа
  const accessCookie = request.cookies.get(ACCESS_COOKIE);
  if (accessCookie?.value === 'granted') {
    return NextResponse.next();
  }

  // Редирект на страницу ввода пароля
  const url = request.nextUrl.clone();
  url.pathname = '/maintenance';
  url.searchParams.set('redirect', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    // Применять ко всем путям кроме статики
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
