'use client';

import { useEffect } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  message: string | null;
  onClose?: () => void;
  autoHideMs?: number;
  className?: string;
}

/**
 * Определяет тип уведомления по первому символу сообщения
 */
function getToastType(message: string): ToastType {
  if (message.startsWith('✅')) return 'success';
  if (message.startsWith('❌')) return 'error';
  if (message.startsWith('⚠️')) return 'warning';
  return 'info';
}

/**
 * Возвращает CSS классы для типа уведомления
 */
function getToastStyles(type: ToastType): string {
  switch (type) {
    case 'success':
      return 'bg-green-500/10 text-green-600 border-green-500/20';
    case 'error':
      return 'bg-red-500/10 text-red-600 border-red-500/20';
    case 'warning':
      return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20';
    case 'info':
    default:
      return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
  }
}

/**
 * Компонент уведомления (Toast)
 * 
 * Использование:
 * ```tsx
 * const [message, setMessage] = useState<string | null>(null);
 * 
 * <Toast message={message} onClose={() => setMessage(null)} />
 * ```
 */
export function Toast({ message, onClose, autoHideMs = 3000, className = '' }: ToastProps) {
  useEffect(() => {
    if (message && onClose && autoHideMs > 0) {
      const timer = setTimeout(onClose, autoHideMs);
      return () => clearTimeout(timer);
    }
  }, [message, onClose, autoHideMs]);

  if (!message) return null;

  const type = getToastType(message);
  const styles = getToastStyles(type);

  return (
    <div 
      className={`p-3 rounded-lg text-center text-sm border ${styles} ${className}`}
      role="alert"
    >
      {message}
    </div>
  );
}

/**
 * Inline Toast — встраивается в поток страницы (как на dashboard)
 */
export function InlineToast({ message, onClose, autoHideMs, className = 'mb-4' }: ToastProps) {
  return (
    <Toast 
      message={message} 
      onClose={onClose} 
      autoHideMs={autoHideMs}
      className={className}
    />
  );
}

/**
 * Fixed Toast — фиксированный сверху страницы (для модальных сценариев)
 */
export function FixedToast({ message, onClose, autoHideMs }: Omit<ToastProps, 'className'>) {
  if (!message) return null;

  const type = getToastType(message);
  const styles = getToastStyles(type);

  return (
    <div 
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-lg text-sm border shadow-lg ${styles}`}
      role="alert"
    >
      {message}
    </div>
  );
}

export default Toast;
