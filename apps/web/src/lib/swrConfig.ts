import { fetchWithRetry, parseApiError, handle401Error } from './errorHandler';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

/**
 * SWR fetcher с автоматической обработкой ошибок
 */
export async function swrFetcher<T>(url: string): Promise<T> {
  try {
    const response = await fetchWithRetry(url, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Handle 401
    if (response.status === 401) {
      handle401Error();
      throw new Error('Unauthorized');
    }

    // Handle other errors
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    
    // Если API возвращает { success, data, error }
    if ('success' in data) {
      if (!data.success) {
        throw new Error(data.error?.message || 'API Error');
      }
      return data.data as T;
    }

    return data as T;
  } catch (error) {
    const apiError = parseApiError(error);
    throw new Error(apiError.message);
  }
}

/**
 * Создать полный URL для API endpoint
 */
export function apiUrl(path: string): string {
  return `${API_URL}${path}`;
}
