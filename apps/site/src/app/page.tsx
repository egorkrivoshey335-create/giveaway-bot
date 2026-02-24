import { redirect } from 'next/navigation';

/**
 * Корневой "/" — редирект к русскоязычному лендингу.
 * Middleware с localePrefix:'as-needed' обрабатывает роутинг,
 * но Next.js генерирует root-страницу — её перенаправляем.
 */
export default function RootPage() {
  redirect('/ru');
}
