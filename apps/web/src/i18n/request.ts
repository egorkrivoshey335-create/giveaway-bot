import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { defaultLocale, locales, type Locale } from './config';

export default getRequestConfig(async ({ requestLocale }) => {
  // URL-based locale (from middleware/routing)
  const localeFromRequest = await requestLocale;

  let locale: Locale = (localeFromRequest as Locale) || defaultLocale;

  // If no URL locale, fall back to cookie
  if (!localeFromRequest || !locales.includes(locale)) {
    const cookieStore = await cookies();
    const cookieLocale = cookieStore.get('locale')?.value as Locale | undefined;
    locale = (cookieLocale && locales.includes(cookieLocale))
      ? cookieLocale
      : defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
