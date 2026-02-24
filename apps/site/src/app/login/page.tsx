import { redirect } from 'next/navigation';

/**
 * Корневой "/login" — редирект к локализованной странице входа.
 * Locale-specific login is at /[locale]/login/page.tsx
 */
export default function RootLoginPage() {
  redirect('/ru/login');
}
