/**
 * Утилиты для обработки API ошибок
 */

export interface ApiError {
  code: string;
  message: string;
  statusCode: number;
}

export class NetworkError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = 'NetworkError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Обработчик HTTP ошибок с retry логикой
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries = 3,
  retryDelay = 1000
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Не ретраим успешные ответы и клиентские ошибки (кроме 429)
      if (response.ok || (response.status >= 400 && response.status < 500 && response.status !== 429)) {
        return response;
      }

      // Ретраим серверные ошибки и 429
      if (response.status >= 500 || response.status === 429) {
        throw new NetworkError(
          `Server error: ${response.status}`,
          response.status,
          'SERVER_ERROR'
        );
      }

      return response;
    } catch (error) {
      lastError = error as Error;

      // Не ретраим на последней попытке
      if (attempt === maxRetries) {
        break;
      }

      // Экспоненциальная задержка: 1s, 2s, 4s
      const delay = retryDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Unknown error');
}

/**
 * Парсинг API ошибки
 */
export function parseApiError(error: unknown): ApiError {
  // Network error
  if (error instanceof NetworkError) {
    return {
      code: error.code,
      message: error.message,
      statusCode: error.statusCode,
    };
  }

  // Fetch error
  if (error instanceof TypeError && error.message === 'Failed to fetch') {
    return {
      code: 'NETWORK_ERROR',
      message: 'Ошибка подключения к серверу',
      statusCode: 0,
    };
  }

  // Generic error
  if (error instanceof Error) {
    return {
      code: 'UNKNOWN_ERROR',
      message: error.message,
      statusCode: 0,
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: 'Неизвестная ошибка',
    statusCode: 0,
  };
}

/**
 * Получить пользовательское сообщение для ошибки
 */
export function getErrorMessage(error: ApiError): string {
  switch (error.code) {
    case 'UNAUTHORIZED':
      return 'Сессия истекла. Перезайдите в приложение';
    case 'FORBIDDEN':
      return 'Недостаточно прав для выполнения действия';
    case 'NOT_FOUND':
      return 'Запрашиваемый ресурс не найден';
    case 'RATE_LIMIT_EXCEEDED':
      return 'Слишком много запросов. Подождите немного';
    case 'SERVER_ERROR':
      return 'Ошибка сервера. Попробуйте позже';
    case 'NETWORK_ERROR':
      return 'Нет подключения к интернету';
    case 'VALIDATION_ERROR':
      return error.message;
    default:
      return error.message || 'Что-то пошло не так';
  }
}

/**
 * Обработчик 401 ошибки - очистка сессии
 */
export function handle401Error() {
  // Очистить cookies
  document.cookie.split(";").forEach((c) => {
    document.cookie = c
      .replace(/^ +/, "")
      .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
  });

  // Показать уведомление
  const tg = window.Telegram?.WebApp;
  if (tg && 'showAlert' in tg && typeof tg.showAlert === 'function') {
    tg.showAlert('Сессия истекла. Перезапустите приложение.');
  }

  // Перезагрузить через 2 секунды
  setTimeout(() => {
    window.location.reload();
  }, 2000);
}
