'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * Ссылка, которая ведёт на /dashboard если пользователь авторизован,
 * иначе на /login
 */
export function SmartLink({ className, children }: { className?: string; children: React.ReactNode }) {
  const [href, setHref] = useState('/login');

  useEffect(() => {
    // Проверяем наличие cookie rb_site_user — значит авторизован
    const hasUser = document.cookie.includes('rb_site_user=');
    if (hasUser) {
      setHref('/dashboard');
    }
  }, []);

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
