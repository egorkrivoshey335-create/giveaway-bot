import type { User, Giveaway } from '@randombeast/database';
import { redis } from './redis.js';

/**
 * Вычисляет fraud score для участника (0-100)
 * ОБНОВЛЕНО (2026-02-16): Полная реализация всех проверок
 * 
 * Критерии:
 * - +20: аккаунт создан менее 30 дней назад
 * - +15: нет фото профиля ✅ РЕАЛИЗОВАНО
 * - +15: нет username
 * - +10: имя содержит спам-паттерны (цифры, спецсимволы)
 * - +20: множественные участия с одного IP ✅ РЕАЛИЗОВАНО
 * - +10: слишком быстрое прохождение (< 5 секунд)
 * - +10: язык/timezone не совпадает ✅ РЕАЛИЗОВАНО
 * 
 * Пороги:
 * - 0-30: нормальный участник
 * - 31-60: подозрительный → автоматическая капча
 * - 61-100: высокий риск → ручная модерация
 */
export async function calculateFraudScore(params: {
  user: Pick<User, 'username' | 'firstName' | 'lastName' | 'createdAt' | 'language'>;
  giveaway?: Pick<Giveaway, 'id'>;
  timeSinceOpen?: number; // milliseconds
  ipAddress?: string;
  previousParticipationsCount?: number;
  hasProfilePhoto?: boolean; // 🔒 ДОБАВЛЕНО: проверка фото профиля
  userTimezone?: string; // 🔒 ДОБАВЛЕНО: timezone пользователя
  expectedTimezone?: string; // 🔒 ДОБАВЛЕНО: ожидаемый timezone по IP
}): Promise<number> {
  let score = 0;
  const { 
    user, 
    timeSinceOpen, 
    previousParticipationsCount,
    ipAddress,
    hasProfilePhoto,
    userTimezone,
    expectedTimezone
  } = params;

  // +20: новый аккаунт (создан менее 30 дней назад)
  const accountAgeDays = Math.floor((Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24));
  if (accountAgeDays < 30) {
    score += 20;
  }

  // 🔒 РЕАЛИЗОВАНО: +15: нет фото профиля
  if (hasProfilePhoto === false) {
    score += 15;
  }

  // +15: нет username
  if (!user.username) {
    score += 15;
  }

  // +10: имя содержит спам-паттерны
  const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  if (fullName) {
    const digitCount = (fullName.match(/\d/g) || []).length;
    const specialCharCount = (fullName.match(/[^a-zA-Zа-яА-ЯёЁ0-9\s]/g) || []).length;
    const totalChars = fullName.length;

    // Много цифр (>30% от имени)
    if (digitCount > totalChars * 0.3) {
      score += 5;
    }

    // Много спецсимволов (>20%)
    if (specialCharCount > totalChars * 0.2) {
      score += 5;
    }

    // Подозрительные паттерны
    const suspiciousPatterns = [
      /bot$/i,
      /\d{4,}/, // 4+ цифр подряд
      /^[0-9]+$/, // только цифры
    ];

    if (suspiciousPatterns.some(pattern => pattern.test(fullName))) {
      score += 5;
    }
  }

  // +10: слишком быстрое прохождение (< 5 секунд)
  if (timeSinceOpen !== undefined && timeSinceOpen < 5000) {
    score += 10;
  }

  // +20: множественные участия (подозрение на фарминг)
  if (previousParticipationsCount !== undefined && previousParticipationsCount > 10) {
    score += 20;
  }

  // 🔒 РЕАЛИЗОВАНО: +20: множественные участия с одного IP
  if (ipAddress) {
    const ipKey = `fraud:ip:${ipAddress}:24h`;
    const ipParticipations = await redis.get(ipKey);
    const ipCount = ipParticipations ? parseInt(ipParticipations, 10) : 0;
    
    // Если с этого IP >5 участий за 24 часа
    if (ipCount > 5) {
      score += 20;
    }
    
    // Увеличиваем счетчик и устанавливаем TTL 24 часа
    await redis.multi()
      .incr(ipKey)
      .expire(ipKey, 24 * 60 * 60)
      .exec();
  }

  // 🔒 РЕАЛИЗОВАНО: +10: язык/timezone не совпадает
  if (userTimezone && expectedTimezone && userTimezone !== expectedTimezone) {
    score += 10;
  }

  return Math.min(score, 100); // Cap at 100
}

/**
 * Проверяет требуется ли капча для пользователя на основе fraud score
 */
export function requiresCaptcha(fraudScore: number, giveawayCaptchaMode: string): boolean {
  // Если создатель включил капчу для всех
  if (giveawayCaptchaMode === 'ALL') {
    return true;
  }

  // Если создатель выключил капчу
  if (giveawayCaptchaMode === 'OFF') {
    return false;
  }

  // SUSPICIOUS_ONLY: автоматическая капча для подозрительных
  if (giveawayCaptchaMode === 'SUSPICIOUS_ONLY') {
    return fraudScore >= 31; // 31-60 = подозрительный, 61+ = высокий риск
  }

  return false;
}

/**
 * Определяет требуется ли ручная модерация
 */
export function requiresManualModeration(fraudScore: number): boolean {
  return fraudScore >= 61;
}
