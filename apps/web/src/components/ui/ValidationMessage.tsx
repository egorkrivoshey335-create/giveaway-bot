/**
 * ValidationMessage — компонент для отображения сообщений валидации
 */

export interface ValidationMessageProps {
  message?: string;
  type?: 'error' | 'warning' | 'success' | 'info';
  className?: string;
}

export function ValidationMessage({ 
  message, 
  type = 'error', 
  className = '' 
}: ValidationMessageProps) {
  if (!message) return null;

  const styles = {
    error: 'text-red-600 dark:text-red-400',
    warning: 'text-yellow-600 dark:text-yellow-400',
    success: 'text-green-600 dark:text-green-400',
    info: 'text-blue-600 dark:text-blue-400',
  };

  const icons = {
    error: '❌',
    warning: '⚠️',
    success: '✅',
    info: 'ℹ️',
  };

  return (
    <div className={`flex items-start gap-2 text-sm mt-1 ${styles[type]} ${className}`}>
      <span className="flex-shrink-0 text-xs">{icons[type]}</span>
      <span>{message}</span>
    </div>
  );
}

/**
 * Хук для валидации URL
 */
export function useURLValidation(url: string): { isValid: boolean; error?: string } {
  if (!url) return { isValid: true };
  
  try {
    new URL(url);
    return { isValid: true };
  } catch {
    return { 
      isValid: false, 
      error: 'Введите корректный URL (например: https://example.com)' 
    };
  }
}

/**
 * Хук для валидации длины текста
 */
export function useTextLengthValidation(
  text: string, 
  min?: number, 
  max?: number
): { isValid: boolean; error?: string } {
  const length = text.length;
  
  if (min !== undefined && length < min) {
    return {
      isValid: false,
      error: `Минимум ${min} символов (сейчас: ${length})`,
    };
  }
  
  if (max !== undefined && length > max) {
    return {
      isValid: false,
      error: `Максимум ${max} символов (сейчас: ${length})`,
    };
  }
  
  return { isValid: true };
}

/**
 * Хук для валидации чисел в диапазоне
 */
export function useNumberRangeValidation(
  value: number,
  min?: number,
  max?: number
): { isValid: boolean; error?: string } {
  if (min !== undefined && value < min) {
    return {
      isValid: false,
      error: `Минимальное значение: ${min}`,
    };
  }
  
  if (max !== undefined && value > max) {
    return {
      isValid: false,
      error: `Максимальное значение: ${max}`,
    };
  }
  
  return { isValid: true };
}
