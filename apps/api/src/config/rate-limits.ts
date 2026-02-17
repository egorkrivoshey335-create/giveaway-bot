/**
 * Endpoint-specific rate limit configurations
 * СОЗДАНО (2026-02-16): Специфичные лимиты для критичных endpoints
 */

export const RATE_LIMITS = {
  // Участие в розыгрыше - защита от спама
  JOIN_GIVEAWAY: {
    max: 10, // 10 запросов
    timeWindow: '1 minute' as const,
  },
  
  // Генерация капчи - защита от брутфорса
  CAPTCHA_GENERATE: {
    max: 10, // 10 генераций
    timeWindow: '10 minutes' as const,
  },
  
  // Проверка капчи
  CAPTCHA_VERIFY: {
    max: 20, // 20 попыток
    timeWindow: '5 minutes' as const,
  },
  
  // Создание розыгрыша
  CREATE_GIVEAWAY: {
    max: 5, // 5 розыгрышей
    timeWindow: '1 hour' as const,
  },
  
  // Загрузка файлов
  FILE_UPLOAD: {
    max: 20, // 20 файлов
    timeWindow: '1 hour' as const,
  },
  
  // Публикация (старт розыгрыша)
  PUBLISH_GIVEAWAY: {
    max: 10, // 10 публикаций
    timeWindow: '1 hour' as const,
  },
  
  // Платежи
  PAYMENT_CREATE: {
    max: 5, // 5 платежей
    timeWindow: '1 hour' as const,
  },
  
  // Проверка подписок
  CHECK_SUBSCRIPTION: {
    max: 30, // 30 проверок
    timeWindow: '1 minute' as const,
  },
  
  // Auth endpoints
  AUTH_LOGIN: {
    max: 10, // 10 логинов
    timeWindow: '5 minutes' as const,
  },
} as const;
