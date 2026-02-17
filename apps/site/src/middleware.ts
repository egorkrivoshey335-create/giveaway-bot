import createMiddleware from 'next-intl/middleware';
import { locales, defaultLocale } from './i18n/config';

export default createMiddleware({
  // All supported locales
  locales,

  // Default locale
  defaultLocale,

  // Prefix the default locale (e.g., /ru/...)
  localePrefix: 'as-needed', // /ru/ not shown, /en/ and /kk/ shown

  // Detect locale from Accept-Language header (browser language)
  localeDetection: true,
});

export const config = {
  // Match all pathnames except for
  // - API routes
  // - _next (Next.js internals)
  // - static files (images, etc.)
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
