import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { defaultLocale, locales, type Locale } from './config';

/**
 * Get locale for server-side rendering
 * Priority: 1) URL segment, 2) cookie, 3) default
 */
export default getRequestConfig(async ({ locale }) => {
  // Validate locale from URL
  const requestLocale = locale as Locale;
  
  // If no locale in URL, try cookie
  let finalLocale: Locale = requestLocale || defaultLocale;
  
  if (!requestLocale) {
    const cookieStore = await cookies();
    const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value as Locale | undefined;
    if (cookieLocale && locales.includes(cookieLocale)) {
      finalLocale = cookieLocale;
    }
  }

  // Ensure valid locale
  if (!locales.includes(finalLocale)) {
    finalLocale = defaultLocale;
  }

  // Load messages dynamically
  const messages = (await import(`../../messages/${finalLocale}.json`)).default;

  return {
    locale: finalLocale,
    messages,
  };
});
