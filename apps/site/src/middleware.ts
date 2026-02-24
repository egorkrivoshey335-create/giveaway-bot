import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { locales, defaultLocale } from './i18n/config';

const intlMiddleware = createMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'as-needed',
  // Don't auto-detect from browser — user picks language manually via switcher
  // Default is Russian which is the primary audience
  localeDetection: false,
});

// Cookie set by POST /api/maintenance after correct password
const ACCESS_COOKIE = 'rb_site_access';

// Static prefixes that are always accessible
const PUBLIC_PREFIXES = ['/api/', '/_next/', '/favicon', '/robots', '/sitemap'];

function isPublicPath(pathname: string): boolean {
  // Always allow static paths
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  // Allow maintenance page with ANY locale prefix: /maintenance, /en/maintenance, /ru/maintenance, /kk/maintenance
  if (pathname === '/maintenance' || pathname.endsWith('/maintenance')) return true;
  return false;
}

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check maintenance mode only when MAINTENANCE_PASSWORD is set in env
  const maintenancePassword = process.env.MAINTENANCE_PASSWORD;
  const isMaintenanceEnabled = maintenancePassword && maintenancePassword.trim() !== '';

  if (isMaintenanceEnabled && !isPublicPath(pathname)) {
    const accessCookie = request.cookies.get(ACCESS_COOKIE);
    const hasAccess = accessCookie?.value === 'granted';

    if (!hasAccess) {
      // Detect locale from Accept-Language header for redirect
      const acceptLang = request.headers.get('accept-language') || '';
      let locale = defaultLocale;
      if (acceptLang.includes('en')) locale = 'en';
      else if (acceptLang.includes('kk')) locale = 'kk';
      else if (acceptLang.includes('ru')) locale = 'ru';

      const maintenanceUrl = new URL(
        locale === defaultLocale ? '/maintenance' : `/${locale}/maintenance`,
        request.url
      );
      return NextResponse.redirect(maintenanceUrl);
    }
  }

  // Normal i18n routing
  return intlMiddleware(request);
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
